/**
 * YouTube Video Search & Standalone Video Stream Resolver
 * Extracts video search results and unthrottled HLS video+audio streams directly from YouTube InnerTube.
 */

import { getYouTubeVisitorData } from './youtubeStreamResolver';
import {
  enrichVideosWithChannelAvatars,
  getChannelAvatar,
  setCachedChannelAvatar,
} from './youtubeAvatarService';

export interface YouTubeVideoSearchResult {
  id: string;
  videoId: string;
  title: string;
  author: string;
  channelId?: string;
  channelAvatar?: string;
  duration: string;
  durationSeconds: number;
  viewCount: string;
  publishedTime: string;
  thumbnail: string;
  rank?: number;
  isLive?: boolean;
}

export interface StandaloneVideoStreamDetails {
  videoId: string;
  hlsUrl: string;
  title: string;
  author: string;
  durationSeconds: number;
  qualityBadge: string;
  thumbnailUrl: string;
  isLive?: boolean;
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

export interface YouTubeSearchPageResult {
  videos: YouTubeVideoSearchResult[];
  continuationToken: string | null;
}

/**
 * Extracts and formats a videoRenderer item into YouTubeVideoSearchResult.
 */
function parseVideoRenderer(vr: any): YouTubeVideoSearchResult | null {
  const videoId = vr.videoId;
  if (!videoId || typeof videoId !== 'string') return null;

  const isLive = Boolean(
    vr.badges?.some(
      (b: any) =>
        b.metadataBadgeRenderer?.style?.includes('LIVE') ||
        b.metadataBadgeRenderer?.label?.toLowerCase() === 'live' ||
        b.metadataBadgeRenderer?.icon?.iconType === 'LIVE'
    ) ||
    vr.thumbnailOverlays?.some(
      (to: any) =>
        to.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE' ||
        to.thumbnailOverlayTimeStatusRenderer?.text?.runs?.some(
          (r: any) => r.text?.toLowerCase() === 'live'
        )
    ) ||
    (typeof vr.viewCountText?.runs?.[1]?.text === 'string' &&
      vr.viewCountText.runs[1].text.toLowerCase().includes('watching')) ||
    (typeof vr.shortViewCountText?.runs?.[1]?.text === 'string' &&
      vr.shortViewCountText.runs[1].text.toLowerCase().includes('watching'))
  );

  const title =
    vr.title?.runs?.map((r: any) => r.text).join('') ||
    vr.title?.simpleText ||
    'Untitled Video';

  const author =
    vr.ownerText?.runs?.map((r: any) => r.text).join('') ||
    vr.shortBylineText?.runs?.map((r: any) => r.text).join('') ||
    'YouTube Creator';

  // Extract the UC... channel ID from browse endpoints
  const channelId =
    vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
    vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
    vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint?.browseEndpoint?.browseId ||
    undefined;

  const channelThumbnails =
    vr.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails ||
    vr.ownerThumbnail?.thumbnails ||
    vr.channelThumbnail?.thumbnails ||
    vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.avatar?.thumbnails ||
    [];
  let channelAvatar = channelThumbnails[channelThumbnails.length - 1]?.url || undefined;
  if (channelAvatar && channelAvatar.startsWith('//')) {
    channelAvatar = `https:${channelAvatar}`;
  }

  // Cache real avatar if present, or lookup from cache
  if (channelAvatar) {
    if (channelId) setCachedChannelAvatar(channelId, channelAvatar);
    if (author) setCachedChannelAvatar(author, channelAvatar);
  } else {
    channelAvatar =
      (channelId && getChannelAvatar(channelId)) ||
      (author && getChannelAvatar(author)) ||
      undefined;
  }

  const duration = isLive ? 'LIVE' : (vr.lengthText?.simpleText || '');
  const durationSeconds = isLive ? 0 : parseDurationSeconds(duration);
  const viewCount =
    vr.shortViewCountText?.simpleText ||
    vr.viewCountText?.simpleText ||
    vr.shortViewCountText?.runs?.map((r: any) => r.text).join('') ||
    vr.viewCountText?.runs?.map((r: any) => r.text).join('') ||
    '';
  const publishedTime = vr.publishedTimeText?.simpleText || '';

  const videoThumbnails = vr.thumbnail?.thumbnails || [];
  let bestThumb = videoThumbnails[videoThumbnails.length - 1]?.url;
  if (bestThumb && bestThumb.startsWith('//')) {
    bestThumb = `https:${bestThumb}`;
  }
  const thumbnail =
    bestThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: videoId,
    videoId,
    title,
    author,
    channelId,
    channelAvatar,
    duration,
    durationSeconds,
    viewCount,
    publishedTime,
    thumbnail,
    isLive,
  };
}

/**
 * Searches YouTube for video content and returns both videos and a continuation token for infinite scroll.
 */
export async function searchYouTubeVideosWithContinuation(
  query: string,
  limit: number = 30
): Promise<YouTubeSearchPageResult> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { videos: [], continuationToken: null };

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
      return { videos: [], continuationToken: null };
    }

    const data = await res.json();
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const results: YouTubeVideoSearchResult[] = [];
    let continuationToken: string | null = null;

    for (const section of contents) {
      if (section?.continuationItemRenderer) {
        continuationToken =
          section.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
      }
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item?.videoRenderer) {
          const parsed = parseVideoRenderer(item.videoRenderer);
          if (parsed) {
            results.push(parsed);
          }
        } else if (item?.continuationItemRenderer) {
          continuationToken =
            item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
        }
      }
    }

    if (results.length > 0) {
      await enrichVideosWithChannelAvatars(results);
    }

    return {
      videos: results.slice(0, limit),
      continuationToken,
    };
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('searchYouTubeVideos error:', err);
    }
    return { videos: [], continuationToken: null };
  }
}

/**
 * Searches YouTube for video content matching query (convenience wrapper).
 */
export async function searchYouTubeVideos(
  query: string,
  limit: number = 30
): Promise<YouTubeVideoSearchResult[]> {
  const page = await searchYouTubeVideosWithContinuation(query, limit);
  return page.videos;
}

/**
 * Fetches the next page of YouTube video search results using an InnerTube continuation token.
 */
export async function fetchNextYouTubeSearchVideos(
  continuationToken: string,
  limit: number = 25
): Promise<YouTubeSearchPageResult> {
  if (!continuationToken) {
    return { videos: [], continuationToken: null };
  }

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
      continuation: continuationToken,
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
      return { videos: [], continuationToken: null };
    }

    const data = await res.json();
    const cmds = data?.onResponseReceivedCommands || [];
    const results: YouTubeVideoSearchResult[] = [];
    let nextContinuationToken: string | null = null;

    for (const cmd of cmds) {
      const continuationItems = cmd?.appendContinuationItemsAction?.continuationItems || [];
      for (const ci of continuationItems) {
        if (ci?.continuationItemRenderer) {
          nextContinuationToken =
            ci.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
        }
        if (ci?.itemSectionRenderer?.contents) {
          for (const item of ci.itemSectionRenderer.contents) {
            if (item?.videoRenderer) {
              const parsed = parseVideoRenderer(item.videoRenderer);
              if (parsed) results.push(parsed);
            } else if (item?.continuationItemRenderer) {
              nextContinuationToken =
                item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
            }
          }
        }
        if (ci?.videoRenderer) {
          const parsed = parseVideoRenderer(ci.videoRenderer);
          if (parsed) results.push(parsed);
        }
      }
    }

    if (results.length > 0) {
      await enrichVideosWithChannelAvatars(results);
    }

    return {
      videos: results.slice(0, limit),
      continuationToken: nextContinuationToken,
    };
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('fetchNextYouTubeSearchVideos error:', err);
    }
    return { videos: [], continuationToken: null };
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

    const isLiveStream = Boolean(
      data?.videoDetails?.isLive ||
      data?.videoDetails?.isLiveContent
    );

    const details: StandaloneVideoStreamDetails = {
      videoId: cleanId,
      hlsUrl,
      title,
      author,
      durationSeconds: isLiveStream ? 0 : durationSeconds,
      qualityBadge,
      thumbnailUrl,
      isLive: isLiveStream,
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

export interface TrendingCategory {
  id: string;
  name: string;
  icon: string;
  chartType: string;
  chartAttribute?: string;
  periodType?: 'WEEKLY' | 'DAILY';
  fallbackQuery: string;
}

export const TRENDING_CATEGORIES: TrendingCategory[] = [
  {
    id: 'trending',
    name: 'Trending',
    icon: 'flame',
    chartType: 'TRENDING_VIDEOS',
    fallbackQuery: 'trending music videos 2026',
  },
  {
    id: 'daily',
    name: 'Daily Top',
    icon: 'musical-notes',
    chartType: 'VIDEOS',
    periodType: 'DAILY',
    fallbackQuery: 'new hindi songs this week',
  },
  {
    id: 'hindi',
    name: 'Bollywood',
    icon: 'film',
    chartType: 'VIDEOS_LOP',
    chartAttribute: 'hi',
    periodType: 'WEEKLY',
    fallbackQuery: 'latest bollywood songs 2026',
  },
  {
    id: 'punjabi',
    name: 'Punjabi',
    icon: 'flash',
    chartType: 'VIDEOS_LOP',
    chartAttribute: 'pa',
    periodType: 'WEEKLY',
    fallbackQuery: 'top punjabi songs 2026',
  },
  {
    id: 'global',
    name: 'Global Hits',
    icon: 'globe',
    chartType: 'VIDEOS_LOP',
    chartAttribute: 'international',
    periodType: 'WEEKLY',
    fallbackQuery: 'top global music videos 2026',
  },
];

const trendingCache = new Map<string, { timestamp: number; videos: YouTubeVideoSearchResult[] }>();
const TRENDING_CACHE_TTL = 15 * 60 * 1000;

/**
 * Fetches YouTube trending music videos via official InnerTube Charts endpoint
 * with instant in-memory caching and resilient fallback.
 */
export async function fetchTrendingYouTubeVideos(
  categoryId: string = 'trending',
  limit: number = 30,
  forceRefresh: boolean = false
): Promise<YouTubeVideoSearchResult[]> {
  const cached = trendingCache.get(categoryId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < TRENDING_CACHE_TTL && cached.videos.length > 0) {
    return cached.videos.slice(0, limit);
  }

  const category = TRENDING_CATEGORIES.find((c) => c.id === categoryId) || TRENDING_CATEGORIES[0];

  try {
    const queryObj: Record<string, string> = {
      perspective: 'CHART_DETAILS',
      chart_params_country_code: 'IN',
      chart_params_chart_type: category.chartType,
      flags: 'MusicCharts__enable_apac_and_shorts_charts_expansion',
    };
    if (category.periodType) queryObj.chart_params_period_type = category.periodType;
    if (category.chartAttribute) queryObj.chart_params_chart_attribute = category.chartAttribute;

    const payload = {
      context: {
        client: {
          clientName: 'WEB_MUSIC_ANALYTICS',
          clientVersion: '2.0',
          hl: 'en-GB',
          gl: 'IN',
        },
      },
      browseId: 'FEmusic_analytics_charts_home',
      query: new URLSearchParams(queryObj).toString(),
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://charts.youtube.com/youtubei/v1/browse?alt=json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://charts.youtube.com/',
        Origin: 'https://charts.youtube.com',
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const content =
        data?.contents?.sectionListRenderer?.contents?.[0]?.musicAnalyticsSectionRenderer?.content;
      const rawItems: any[] =
        content?.videos?.[0]?.videoViews ||
        (Array.isArray(content?.videos) && content.videos[0]?.videoViews ? content.videos[0].videoViews : []) ||
        content?.trackTypes?.[0]?.trackViews ||
        [];

      if (rawItems.length > 0) {
        const results: YouTubeVideoSearchResult[] = [];
        const seenIds = new Set<string>();

        rawItems.forEach((item: any, index: number) => {
          const videoId = item.id || item.encryptedVideoId;
          if (!videoId || typeof videoId !== 'string' || seenIds.has(videoId)) return;
          seenIds.add(videoId);

          const durSec = typeof item.videoDuration === 'number' && item.videoDuration > 0 ? item.videoDuration : 0;
          const mins = Math.floor(durSec / 60);
          const secs = durSec % 60;
          const durStr = durSec > 0 ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : '';

          const thumbs = item.thumbnail?.thumbnails || [];
          let bestThumb = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          if (bestThumb.startsWith('//')) {
            bestThumb = `https:${bestThumb}`;
          }

          const rawArtist = Array.isArray(item.artists)
            ? item.artists.map((a: any) => a.name).join(', ')
            : item.channelName || 'YouTube Artist';

          const title = item.title || 'Untitled Video';
          const rank = item.chartEntryMetadata?.currentPosition || index + 1;
          const channelId = item.externalChannelId || undefined;
          const channelAvatar =
            (channelId && getChannelAvatar(channelId)) ||
            (rawArtist && getChannelAvatar(rawArtist)) ||
            undefined;

          results.push({
            id: videoId,
            videoId,
            channelId,
            title,
            author: rawArtist,
            channelAvatar,
            duration: durStr,
            durationSeconds: durSec,
            viewCount: `#${rank} on YouTube Charts`,
            publishedTime: '',
            thumbnail: bestThumb,
            rank,
          });
        });

        if (results.length > 0) {
          await enrichVideosWithChannelAvatars(results);
          trendingCache.set(categoryId, { timestamp: Date.now(), videos: results });
          return results.slice(0, limit);
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn(`[Trending] fetch error for ${categoryId}, using search fallback:`, err);
    }
  }

  // Fallback to curated search if charts API is unreachable
  try {
    const fallbackResults = await searchYouTubeVideos(category.fallbackQuery, limit);
    if (fallbackResults.length > 0) {
      const ranked = fallbackResults.map((v, i) => ({ ...v, rank: i + 1 }));
      trendingCache.set(categoryId, { timestamp: Date.now(), videos: ranked });
      return ranked;
    }
  } catch {}

  return [];
}

/**
 * Fetches related / recommended YouTube videos for a given video ID to power the infinite Up Next auto-play queue.
 */
export async function fetchRelatedYouTubeVideos(
  videoId: string,
  limit: number = 15
): Promise<YouTubeVideoSearchResult[]> {
  const cleanId = videoId.replace(/^yt_/, '').trim();
  if (!cleanId) return [];

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
      videoId: cleanId,
    };

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
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

    if (res.ok) {
      const data = await res.json();
      const results: YouTubeVideoSearchResult[] = [];
      const seenIds = new Set<string>([cleanId]);

      // Look through secondaryResults or watchNextResults
      const resultsSection =
        data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results ||
        [];

      for (const item of resultsSection) {
        const cvr = item?.compactVideoRenderer || item?.videoRenderer;
        const lvm = item?.lockupViewModel;
        if (!cvr && !lvm) continue;

        let vId = cvr?.videoId || lvm?.contentId;
        if (!vId && lvm?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId) {
          vId = lvm.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId;
        }
        if (!vId || typeof vId !== 'string' || seenIds.has(vId)) continue;
        seenIds.add(vId);

        let title =
          cvr?.title?.simpleText ||
          cvr?.title?.runs?.map((r: any) => r.text).join('') ||
          '';

        let author =
          cvr?.longBylineText?.runs?.map((r: any) => r.text).join('') ||
          cvr?.shortBylineText?.runs?.map((r: any) => r.text).join('') ||
          '';

        let channelId =
          cvr?.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
          cvr?.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.navigationEndpoint?.browseEndpoint?.browseId ||
          undefined;

        const channelThumbnails =
          cvr?.channelThumbnail?.thumbnails ||
          cvr?.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails ||
          [];
        let channelAvatar = channelThumbnails[channelThumbnails.length - 1]?.url;

        let duration = cvr?.lengthText?.simpleText || '';
        let viewCount = cvr?.viewCountText?.simpleText || '';
        let publishedTime = cvr?.publishedTimeText?.simpleText || '';

        const thumbs = cvr?.thumbnail?.thumbnails || [];
        let bestThumb = thumbs[thumbs.length - 1]?.url;

        if (lvm) {
          const meta = lvm.metadata?.lockupMetadataViewModel;
          if (meta?.title?.content) title = meta.title.content;
          const metaRows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
          if (metaRows[0]?.metadataParts?.[0]?.text?.content) {
            author = metaRows[0].metadataParts[0].text.content;
          }
          if (metaRows[1]?.metadataParts?.[0]?.text?.content) {
            viewCount = metaRows[1].metadataParts[0].text.content;
          }
          if (metaRows[1]?.metadataParts?.[1]?.text?.content) {
            publishedTime = metaRows[1].metadataParts[1].text.content;
          }
          const imageObj = meta?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image;
          const avatarSources = imageObj?.sources || [];
          if (avatarSources.length > 0) {
            channelAvatar = avatarSources[avatarSources.length - 1]?.url;
          }
          const lvmBrowseId =
            meta?.image?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint?.browseId;
          if (lvmBrowseId) channelId = lvmBrowseId;

          const thumbObj = lvm.contentImage?.thumbnailViewModel?.image;
          const thumbSources = thumbObj?.sources || [];
          if (thumbSources.length > 0) {
            bestThumb = thumbSources[thumbSources.length - 1]?.url;
          }
          const badges = lvm.contentImage?.thumbnailBottomOverlayViewModel?.badges || [];
          const durBadge = badges[0]?.thumbnailBadgeViewModel?.text;
          if (durBadge) duration = durBadge;
        }

        if (!title) title = 'Recommended Video';
        if (!author) author = 'YouTube Creator';

        const durationSeconds = parseDurationSeconds(duration);
        if (channelAvatar && channelAvatar.startsWith('//')) channelAvatar = `https:${channelAvatar}`;

        if (!bestThumb) bestThumb = `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
        if (bestThumb.startsWith('//')) bestThumb = `https:${bestThumb}`;

        if (channelAvatar) {
          if (channelId) setCachedChannelAvatar(channelId, channelAvatar);
          if (author) setCachedChannelAvatar(author, channelAvatar);
        } else {
          channelAvatar =
            (channelId && getChannelAvatar(channelId)) ||
            (author && getChannelAvatar(author)) ||
            undefined;
        }

        results.push({
          id: vId,
          videoId: vId,
          channelId,
          title,
          author,
          channelAvatar,
          duration,
          durationSeconds,
          viewCount,
          publishedTime,
          thumbnail: bestThumb,
        });

        if (results.length >= limit) break;
      }

      if (results.length > 0) {
        await enrichVideosWithChannelAvatars(results);
        return results;
      }
    }
  } catch (err) {
    console.warn('[fetchRelatedYouTubeVideos] error:', err);
  }

  return [];
}

