/**
 * Direct YouTube Audio Stream Resolver
 * Extracts authentic, direct, unthrottled 128k AAC / 160k Opus audio streams directly from GoogleVideo CDN
 * using YouTube InnerTube's native VISIONOS client handshake.
 * Bypasses Botguard and requires no third-party proxies, ensuring the user hears the EXACT original audio.
 */

let cachedVisitorData: string | null = null;
let visitorDataExpiresAt = 0;

/**
 * Fetches and caches YouTube visitor data from sw.js_data (valid for 24 hours).
 */
export async function getYouTubeVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedVisitorData && now < visitorDataExpiresAt) {
    return cachedVisitorData;
  }

  // 1. Primary fast method: sw.js_data JSON (~1KB)
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://www.youtube.com/sw.js_data', {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = await res.text();
      const jsonStr = text.replace(/^\)\]\}'\s*/, '');
      const parsed = JSON.parse(jsonStr);
      const visitor = parsed?.[0]?.[2]?.[0]?.[0]?.[13];
      if (visitor && typeof visitor === 'string' && visitor.length > 20) {
        cachedVisitorData = visitor;
        visitorDataExpiresAt = now + 24 * 60 * 60 * 1000;
        return visitor;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch YouTube visitorData from sw.js_data:', err);
  }

  // 2. Secondary fallback: extract VISITOR_DATA from youtube.com homepage
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('https://www.youtube.com/', {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();
      const match = html.match(/"VISITOR_DATA":"([^"]+)"/);
      if (match && match[1] && match[1].length > 20) {
        cachedVisitorData = match[1];
        visitorDataExpiresAt = now + 24 * 60 * 60 * 1000;
        return match[1];
      }
    }
  } catch (err) {
    console.warn('Failed to fetch YouTube visitorData from homepage:', err);
  }

  return cachedVisitorData || '';
}

/**
 * Resolves direct googlevideo audio stream URL for any YouTube video ID.
 * Returns direct HTTPS audio URL (AAC 128kbps or Opus 160kbps).
 */
export async function resolveDirectYouTubeStream(videoId: string): Promise<string | null> {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return null;
  }

  try {
    const visitorData = await getYouTubeVisitorData();

    const payload = {
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          visitorData: visitorData || undefined,
          hl: 'en',
          gl: 'IN',
        },
      },
      videoId: cleanId,
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'X-YouTube-Client-Name': '101',
      'X-YouTube-Client-Version': '1.02',
      'Origin': 'https://www.youtube.com',
    };

    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    if (status && status !== 'OK') {
      // Normal fallback condition: video requires authentication (age-gate / bot check) or is restricted.
      // Return null so the audio pipeline seamlessly resolves the official audio from CDN fallback without LogBox warnings.
      return null;
    }

    const formats = (data?.streamingData?.formats || []).concat(
      data?.streamingData?.adaptiveFormats || []
    );

    // Filter audio streams that have a direct direct HTTPS URL
    const audioFormats = formats.filter(
      (f: any) => (f?.mimeType?.includes('audio') || f?.itag === 140 || f?.itag === 251) && f?.url
    );

    if (audioFormats.length === 0) {
      return null;
    }

    // 1. Prefer Opus 160kbps (itag 251) - 48kHz studio audio, YouTube's highest quality stream
    const opus251 = audioFormats.find((f: any) => f.itag === 251);
    if (opus251?.url) {
      return opus251.url;
    }

    // 2. Fallback to AAC 128kbps (itag 140) - 44.1kHz standard stream
    const aac140 = audioFormats.find((f: any) => f.itag === 140);
    if (aac140?.url) {
      return aac140.url;
    }

    // 3. Fallback to any audio stream with highest bitrate
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    return audioFormats[0].url;
  } catch (err: any) {
    // Silently ignore aborted/canceled requests and expected network timeouts
    if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
      return null;
    }
    return null;
  }
}

interface CachedVideoStream {
  url: string;
  expiresAt: number;
}

const videoStreamCache = new Map<string, CachedVideoStream>();
const MAX_VIDEO_CACHE_ENTRIES = 50;

function setCachedVideoUrl(cleanId: string, url: string): void {
  if (videoStreamCache.size >= MAX_VIDEO_CACHE_ENTRIES) {
    const oldestKey = videoStreamCache.keys().next().value;
    if (oldestKey) {
      videoStreamCache.delete(oldestKey);
    }
  }

  let expiresAt = Date.now() + 5 * 60 * 60 * 1000; // default 5 hours
  const match = url.match(/[?&]expire=(\d+)/);
  if (match && match[1]) {
    expiresAt = parseInt(match[1], 10) * 1000;
  }

  videoStreamCache.set(cleanId, { url, expiresAt });
}

/**
 * Resolves direct googlevideo MP4 video stream URL for any YouTube video ID.
 * Returns direct HTTPS video URL (720p or 480p MP4) suitable for silent background canvas loops.
 */
export async function resolveDirectYouTubeVideoStream(videoId: string): Promise<string | null> {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return null;
  }

  const cached = videoStreamCache.get(cleanId);
  if (cached) {
    // Return cached URL if it has more than 5 minutes before expiration
    if (Date.now() < cached.expiresAt - 300000) {
      return cached.url;
    }
    // Expired - purge from cache to trigger fresh resolution
    videoStreamCache.delete(cleanId);
  }

  try {
    const visitorData = await getYouTubeVisitorData();

    const payload = {
      context: {
        client: {
          clientName: 'VISIONOS',
          clientVersion: '1.02',
          deviceMake: 'Apple',
          deviceModel: 'RealityDevice17,1',
          osName: 'visionOS',
          osVersion: '26.5.23O471',
          visitorData: visitorData || undefined,
          hl: 'en',
          gl: 'IN',
        },
      },
      videoId: cleanId,
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'X-YouTube-Client-Name': '101',
      'X-YouTube-Client-Version': '1.02',
      'Origin': 'https://www.youtube.com',
    };

    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.playabilityStatus?.status !== 'OK') {
      return null;
    }

    const adaptive = data?.streamingData?.adaptiveFormats || [];
    const videoMp4Formats = adaptive.filter(
      (f: any) => f?.mimeType && f.mimeType.includes('video/mp4') && f?.url
    );

    if (videoMp4Formats.length === 0) {
      return null;
    }

    // 1. Primary: 720p 60fps MP4 (itag 298, H.264 / avc1 hardware accelerated, ultra smooth 60fps)
    const p720p60H264 = videoMp4Formats.find(
      (f: any) =>
        f.itag === 298 ||
        ((f.fps === 60 || f?.qualityLabel?.includes('60')) &&
          f?.qualityLabel?.includes('720') &&
          f?.mimeType?.includes('avc1'))
    );
    if (p720p60H264?.url) {
      setCachedVideoUrl(cleanId, p720p60H264.url);
      return p720p60H264.url;
    }

    // 2. Fallback: Any 720p 60fps format (e.g. itag 398 or qualityLabel 720p60)
    const p720p60Any = videoMp4Formats.find(
      (f: any) =>
        f.itag === 298 ||
        f.itag === 398 ||
        (f.fps === 60 && f?.qualityLabel?.includes('720')) ||
        f?.qualityLabel?.includes('720p60')
    );
    if (p720p60Any?.url) {
      setCachedVideoUrl(cleanId, p720p60Any.url);
      return p720p60Any.url;
    }

    // 3. Fallback: Standard 720p (30fps) MP4 H.264 (itag 136 or qualityLabel 720)
    const p720H264 = videoMp4Formats.find(
      (f: any) =>
        (f.itag === 136 || f?.qualityLabel?.includes('720')) &&
        f?.mimeType?.includes('avc1')
    );
    if (p720H264?.url) {
      setCachedVideoUrl(cleanId, p720H264.url);
      return p720H264.url;
    }

    // 4. Fallback: Any 720p format
    const p720Any = videoMp4Formats.find(
      (f: any) => f?.qualityLabel?.includes('720')
    );
    if (p720Any?.url) {
      setCachedVideoUrl(cleanId, p720Any.url);
      return p720Any.url;
    }

    // 5. Fallback: 1080p if available
    const p1080 = videoMp4Formats.find(
      (f: any) => f?.qualityLabel?.includes('1080')
    );
    if (p1080?.url) {
      setCachedVideoUrl(cleanId, p1080.url);
      return p1080.url;
    }

    // 6. Fallback: 480p / 360p
    const p480 = videoMp4Formats.find(
      (f: any) => f.itag === 135 || f?.qualityLabel?.includes('480')
    );
    if (p480?.url) {
      setCachedVideoUrl(cleanId, p480.url);
      return p480.url;
    }

    const first = videoMp4Formats[0]?.url || null;
    if (first) setCachedVideoUrl(cleanId, first);
    return first;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
      return null;
    }
    return null;
  }
}

