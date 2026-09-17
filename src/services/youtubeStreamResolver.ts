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

export interface VideoStreamDetails {
  url: string;
  qualityLabel: string;
  resolution: '4K' | '2K' | '1080p' | '720p' | '480p';
  badge: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
}

interface CachedVideoStream {
  details: VideoStreamDetails;
  expiresAt: number;
}

const videoStreamCache = new Map<string, CachedVideoStream>();
const MAX_VIDEO_CACHE_ENTRIES = 50;

function setCachedVideoDetails(cleanId: string, details: VideoStreamDetails): void {
  if (videoStreamCache.size >= MAX_VIDEO_CACHE_ENTRIES) {
    const oldestKey = videoStreamCache.keys().next().value;
    if (oldestKey) {
      videoStreamCache.delete(oldestKey);
    }
  }

  let expiresAt = Date.now() + 5 * 60 * 60 * 1000; // default 5 hours
  const match = details.url.match(/[?&]expire=(\d+)/);
  if (match && match[1]) {
    expiresAt = parseInt(match[1], 10) * 1000;
  }

  videoStreamCache.set(cleanId, { details, expiresAt });
}

export function getCachedVideoDetails(videoId: string): VideoStreamDetails | null {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  const cached = videoStreamCache.get(cleanId);
  if (cached && Date.now() < cached.expiresAt - 300000) {
    return cached.details;
  }
  return null;
}

function scoreVideoFormat(f: any): number {
  let score = 0;
  const q = (f.qualityLabel || '').toLowerCase();
  const h = f.height || 0;
  const fps = f.fps || 30;
  const br = f.bitrate || 0;

  // 1. Resolution tiers (Favor 4K / 2K for max sharpness and supersampled color)
  if (h >= 2160 || q.includes('2160') || q.includes('4k')) {
    score += 45000000;
  } else if (h >= 1440 || q.includes('1440') || q.includes('2k')) {
    score += 40000000;
  } else if (h >= 1080 || q.includes('1080')) {
    score += 25000000;
  } else if (h >= 720 || q.includes('720')) {
    score += 15000000;
  } else {
    score += 5000000;
  }

  // 2. High frame rate bonus (50fps/60fps)
  if (fps >= 50 || /\b60\b|60fps|p60/i.test(q)) {
    score += 6000000;
  }

  // 3. Bitrate bonus (vital for sharpness & eliminating compression artifacts)
  score += Math.min(br, 25000000);

  return score;
}

function getResolutionLabel(f: any): { resolution: '4K' | '2K' | '1080p' | '720p' | '480p'; badge: string } {
  const h = f.height || 0;
  const q = (f.qualityLabel || '').toLowerCase();
  const fps = f.fps || 30;
  const is60 = fps >= 50 || /\b60\b|60fps|p60/i.test(q);

  if (h >= 2160 || q.includes('2160') || q.includes('4k')) {
    return { resolution: '4K', badge: is60 ? '4K 60' : '4K UHD' };
  }
  if (h >= 1440 || q.includes('1440') || q.includes('2k')) {
    return { resolution: '2K', badge: is60 ? '2K 60' : '2K QHD' };
  }
  if (h >= 1080 || q.includes('1080')) {
    return { resolution: '1080p', badge: is60 ? '1080p60' : '1080p HD' };
  }
  if (h >= 720 || q.includes('720')) {
    return { resolution: '720p', badge: is60 ? '720p60' : '720p HD' };
  }
  return { resolution: '480p', badge: '480p' };
}

/**
 * Resolves direct googlevideo video stream details (including URL, resolution, bitrate, and badge).
 * Unlocks 4K (2160p) and 2K (1440p) VP9 / AV1 streams with up to 18 Mbps bitrate for cinema-grade sharpness.
 */
export async function resolveDirectYouTubeVideoDetails(videoId: string): Promise<VideoStreamDetails | null> {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return null;
  }

  const cached = videoStreamCache.get(cleanId);
  if (cached) {
    if (Date.now() < cached.expiresAt - 300000) {
      return cached.details;
    }
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
    // Accept both video/mp4 and video/webm (VP9, AV1, and H.264) for ultra-sharp 4K/2K/1080p
    const videoFormats = adaptive.filter(
      (f: any) =>
        f?.mimeType &&
        (f.mimeType.includes('video/mp4') || f.mimeType.includes('video/webm')) &&
        f?.url
    );

    if (videoFormats.length === 0) {
      return null;
    }

    videoFormats.sort((a: any, b: any) => scoreVideoFormat(b) - scoreVideoFormat(a));
    const best = videoFormats[0];
    const { resolution, badge } = getResolutionLabel(best);

    const details: VideoStreamDetails = {
      url: best.url,
      qualityLabel: best.qualityLabel || `${best.height || 1080}p`,
      resolution,
      badge,
      width: best.width,
      height: best.height,
      fps: best.fps,
      bitrate: best.bitrate,
    };

    setCachedVideoDetails(cleanId, details);
    return details;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
      return null;
    }
    return null;
  }
}

/**
 * Resolves direct googlevideo video stream URL for any YouTube video ID.
 * Returns direct HTTPS video URL (4K, 2K, 1080p, or 720p).
 */
export async function resolveDirectYouTubeVideoStream(videoId: string): Promise<string | null> {
  const details = await resolveDirectYouTubeVideoDetails(videoId);
  return details?.url || null;
}

