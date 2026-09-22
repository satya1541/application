/**
 * YouTube Video Search & Standalone Video Stream Resolver
 * Extracts video search results and unthrottled HLS video+audio streams directly from YouTube InnerTube.
 */

import { getYouTubeVisitorData } from './youtubeStreamResolver';

export interface YouTubeVideoSearchResult {
  id: string;
  videoId: string;
  title: string;
  author: string;
  channelAvatar?: string;
  duration: string;
  durationSeconds: number;
  viewCount: string;
  publishedTime: string;
  thumbnail: string;
}

export interface StandaloneVideoStreamDetails {
  videoId: string;
  hlsUrl: string;
  title: string;
  author: string;
  durationSeconds: number;
  qualityBadge: string;
  thumbnailUrl: string;
}

const videoStreamCache = new Map<string, { details: StandaloneVideoStreamDetails; expiresAt: number }>();
const inFlightStreamPromises = new Map<string, Promise<StandaloneVideoStreamDetails | null>>();

// Eagerly pre-warm visitorData in background so initial player handshakes are instant
getYouTubeVisitorData().catch(() => {});

/**
 * Returns cached video stream details immediately if present and valid (0ms lookup).
 */
export function getCachedVideoStream(videoId: string): StandaloneVideoStreamDetails | null {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  const cached = videoStreamCache.get(cleanId);
  if (cached && Date.now() < cached.expiresAt - 300000) {
    return cached.details;
  }
  return null;
}

function parseDurationSeconds(str: string): number {
  if (!str) return 0;
  const parts = str.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  return parseInt(str, 10) || 0;
}

/**
 * Fetches real-time YouTube search suggestions (autocomplete queries)
 */
export async function fetchYouTubeSearchSuggestions(query: string): Promise<string[]> {
  const clean = query.trim();
  if (!clean) return [];

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2500);
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter((item): item is string => typeof item === 'string').slice(0, 10);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Searches YouTube for video content matching query (e.g. "music video").
 * Returns clean list of videos with metadata and high-res thumbnails.
 */
export async function searchYouTubeVideos(
  query: string,
  limit: number = 30
): Promise<YouTubeVideoSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  try {
    const visitorData = await getYouTubeVisitorData();

    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240105.01.00',
          hl: 'en',
          gl: 'IN',
          visitorData: visitorData || undefined,
        },
      },
      query: cleanQuery,
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);

    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Origin: 'https://www.youtube.com',
        ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const results: YouTubeVideoSearchResult[] = [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item?.videoRenderer) {
          const vr = item.videoRenderer;
          const videoId = vr.videoId;
          if (!videoId || typeof videoId !== 'string') continue;

          const title =
            vr.title?.runs?.map((r: any) => r.text).join('') ||
            vr.title?.simpleText ||
            'Untitled Video';

          const author =
            vr.ownerText?.runs?.map((r: any) => r.text).join('') ||
            vr.shortBylineText?.runs?.map((r: any) => r.text).join('') ||
            'YouTube Creator';

          const channelThumbnails =
            vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail
              ?.thumbnails || [];
          const channelAvatar = channelThumbnails[channelThumbnails.length - 1]?.url || undefined;

          const duration = vr.lengthText?.simpleText || '';
          const durationSeconds = parseDurationSeconds(duration);
          const viewCount =
            vr.shortViewCountText?.simpleText ||
            vr.viewCountText?.simpleText ||
            '';
          const publishedTime = vr.publishedTimeText?.simpleText || '';

          const videoThumbnails = vr.thumbnail?.thumbnails || [];
          // Pick best thumbnail, preferably 720p or highest resolution
          const bestThumb = videoThumbnails[videoThumbnails.length - 1]?.url;
          const thumbnail =
            bestThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          results.push({
            id: videoId,
            videoId,
            title,
            author,
            channelAvatar,
            duration,
            durationSeconds,
            viewCount,
            publishedTime,
            thumbnail,
          });

          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('searchYouTubeVideos error:', err);
    }
    return [];
  }
}

/**
 * Resolves standalone video stream details (HLS manifest URL + metadata)
 * for playback in an independent video player.
 */
export async function resolveYouTubeStandaloneVideoStream(
  videoId: string
): Promise<StandaloneVideoStreamDetails | null> {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    return null;
  }

  // 1. Instant return from cache (0ms)
  const cached = getCachedVideoStream(cleanId);
  if (cached) {
    return cached;
  }

  // 2. Return existing in-flight promise to prevent duplicate requests
  const existingPromise = inFlightStreamPromises.get(cleanId);
  if (existingPromise) {
    return existingPromise;
  }

  const fetchPromise = (async (): Promise<StandaloneVideoStreamDetails | null> => {
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
      Origin: 'https://www.youtube.com',
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

    const hlsUrl = data?.streamingData?.hlsManifestUrl;
    if (!hlsUrl) {
      return null;
    }

    const title = data?.videoDetails?.title || 'YouTube Video';
    const author = data?.videoDetails?.author || 'YouTube';
    const durationSeconds = parseInt(data?.videoDetails?.lengthSeconds || '0', 10);
    const thumbnailUrl =
      data?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
      `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`;

    // Determine highest available stream quality (4K 60fps, 2K 60fps, 1080p 60fps, etc.)
    const adaptive = data?.streamingData?.adaptiveFormats || [];
    let qualityBadge = '1080p 60fps';

    const has4k60 = adaptive.some(
      (f: any) =>
        (f.qualityLabel?.includes('2160p60') || (f.height >= 2160 && (f.fps || 0) >= 50))
    );
    const has4k = adaptive.some(
      (f: any) => f.qualityLabel?.includes('2160p') || f.height >= 2160
    );
    const has2k60 = adaptive.some(
      (f: any) =>
        (f.qualityLabel?.includes('1440p60') || (f.height >= 1440 && (f.fps || 0) >= 50))
    );
    const has2k = adaptive.some(
      (f: any) => f.qualityLabel?.includes('1440p') || f.height >= 1440
    );
    const has1080p60 = adaptive.some(
      (f: any) =>
        (f.qualityLabel?.includes('1080p60') || (f.height >= 1080 && (f.fps || 0) >= 50))
    );
    const has1080p = adaptive.some(
      (f: any) => f.qualityLabel?.includes('1080p') || f.height >= 1080
    );

    if (has4k60) {
      qualityBadge = '4K 60fps';
    } else if (has4k) {
      qualityBadge = '4K UHD';
    } else if (has2k60) {
      qualityBadge = '2K 60fps';
    } else if (has2k) {
      qualityBadge = '2K QHD';
    } else if (has1080p60) {
      qualityBadge = '1080p 60fps';
    } else if (has1080p) {
      qualityBadge = '1080p HD';
    } else {
      qualityBadge = '720p HD';
    }

    const details: StandaloneVideoStreamDetails = {
      videoId: cleanId,
      hlsUrl,
      title,
      author,
      durationSeconds,
      qualityBadge,
      thumbnailUrl,
    };

    // Cache with expiry
    let expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    const match = hlsUrl.match(/[?&]expire=(\d+)/);
    if (match && match[1]) {
      expiresAt = parseInt(match[1], 10) * 1000;
    }

    videoStreamCache.set(cleanId, { details, expiresAt });
    return details;
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('resolveYouTubeStandaloneVideoStream error:', err);
    }
    return null;
  } finally {
    inFlightStreamPromises.delete(cleanId);
  }
  })();

  inFlightStreamPromises.set(cleanId, fetchPromise);
  return fetchPromise;
}
