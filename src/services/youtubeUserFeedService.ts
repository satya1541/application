/**
 * YouTube User Feed Service
 * Fetches personalized YouTube Subscriptions Feed, Liked Videos, and Playlists
 * using the user's authenticated Google Account (OAuth provider_token).
 */

import { SafeStorage } from './storage';
import { YouTubeVideoSearchResult } from './youtubeVideoSearchService';

export const GOOGLE_YOUTUBE_TOKEN_KEY = '@shorty_google_youtube_token';
export const GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY = '@shorty_google_youtube_refresh_token';

let inMemoryToken: string | null = null;
const userFeedCache = new Map<string, { timestamp: number; videos: YouTubeVideoSearchResult[] }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

/**
 * Get the stored Google YouTube OAuth access token.
 */
export async function getGoogleYouTubeToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  try {
    const stored = await SafeStorage.getItem(GOOGLE_YOUTUBE_TOKEN_KEY);
    inMemoryToken = stored;
    return stored;
  } catch {
    return null;
  }
}

/**
 * Save Google OAuth tokens after successful Google login.
 */
export async function saveGoogleYouTubeTokens(
  accessToken: string,
  refreshToken?: string | null
): Promise<void> {
  inMemoryToken = accessToken;
  await SafeStorage.setItem(GOOGLE_YOUTUBE_TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SafeStorage.setItem(GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY, refreshToken);
  }
}

/**
 * Clear stored Google tokens on logout or authorization revocation.
 */
export async function clearGoogleYouTubeTokens(): Promise<void> {
  inMemoryToken = null;
  userFeedCache.clear();
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_TOKEN_KEY);
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY);
}

/**
 * Checks whether a Google YouTube access token is currently available.
 */
export async function isYouTubeConnected(): Promise<boolean> {
  const token = await getGoogleYouTubeToken();
  return !!token;
}

/**
 * Parses ISO 8601 duration (e.g. "PT4M13S", "PT1H2M3S") to seconds and "MM:SS" format.
 */
function parseISO8601Duration(isoStr?: string): { formatted: string; seconds: number } {
  if (!isoStr) return { formatted: '3:30', seconds: 210 };
  const matches = isoStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return { formatted: '3:30', seconds: 210 };

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  let formatted = '';
  if (hours > 0) {
    formatted = `${hours}:${pad(minutes)}:${pad(seconds)}`;
  } else {
    formatted = `${minutes}:${pad(seconds)}`;
  }

  return { formatted, seconds: totalSeconds };
}

/**
 * Formats published ISO date to relative time string ("2 hours ago", "3 days ago").
 */
function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * Formats view count numbers into short strings ("1.4M views").
 */
function formatViewCount(views?: string | number): string {
  if (!views) return '';
  const num = typeof views === 'string' ? parseInt(views, 10) : views;
  if (isNaN(num)) return '';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B views`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
}

/**
 * Batch enriches a list of video IDs with durations and view counts using YouTube Data API.
 */
async function enrichVideosMetadata(
  videoIds: string[],
  token: string
): Promise<Map<string, { duration: string; durationSeconds: number; viewCount: string }>> {
  const metaMap = new Map<string, { duration: string; durationSeconds: number; viewCount: string }>();
  if (videoIds.length === 0) return metaMap;

  try {
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      chunks.push(videoIds.slice(i, i + 50));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${chunk.join(',')}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        const items = data.items || [];
        for (const item of items) {
          const { formatted, seconds } = parseISO8601Duration(item.contentDetails?.duration);
          const viewCount = formatViewCount(item.statistics?.viewCount);
          metaMap.set(item.id, {
            duration: formatted,
            durationSeconds: seconds,
            viewCount,
          });
        }
      })
    );
  } catch (err) {
    console.warn('[youtubeUserFeedService] Failed to enrich video metadata:', err);
  }

  return metaMap;
}

export interface UserFeedResult {
  videos: YouTubeVideoSearchResult[];
  requiresReauth?: boolean;
  notConnected?: boolean;
  emptyFeed?: boolean;
  error?: string;
}

/**
 * Fetches user's Subscriptions Feed (latest uploads from subscribed channels).
 * Uses official subscriptions.list followed by parallel upload playlist queries.
 */
export async function fetchUserSubscriptionsFeed(maxResults = 30): Promise<UserFeedResult> {
  const token = await getGoogleYouTubeToken();
  if (!token) {
    return { videos: [], notConnected: true };
  }

  const cacheKey = `subscriptions_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { videos: cached.videos };
  }

  try {
    // 1. Fetch user's subscribed channels
    const subUrl = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=25`;
    const subRes = await fetch(subUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (subRes.status === 401) {
      console.warn('[youtubeUserFeedService] 401 Unauthorized - Google token expired');
      await clearGoogleYouTubeTokens();
      return { videos: [], requiresReauth: true, error: 'Your YouTube session expired. Please reconnect.' };
    }

    if (subRes.status === 403) {
      const errText = await subRes.text();
      console.warn('[youtubeUserFeedService] 403 Forbidden:', errText);
      const isScopeIssue =
        errText.includes('insufficient') ||
        errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        errText.includes('PERMISSION_DENIED');
      if (isScopeIssue) {
        await clearGoogleYouTubeTokens();
        return {
          videos: [],
          requiresReauth: true,
          error: 'YouTube read permission is required. Tap Grant YouTube Access below.',
        };
      }
      return { videos: [], error: 'YouTube API Access Forbidden. Check Google Cloud settings.' };
    }

    if (!subRes.ok) {
      const errBody = await subRes.text();
      console.warn('[youtubeUserFeedService] Subscriptions error:', subRes.status, errBody);
      return { videos: [], error: `YouTube API Error (${subRes.status})` };
    }

    const subData = await subRes.json();
    const channels = subData.items || [];

    if (channels.length === 0) {
      return { videos: [], emptyFeed: true };
    }

    // 2. Extract channel IDs and convert to upload playlists (UC... -> UU...)
    const channelIds: string[] = channels
      .map((c: any) => c.snippet?.resourceId?.channelId)
      .filter((id: any): id is string => typeof id === 'string' && id.startsWith('UC'));

    if (channelIds.length === 0) {
      return { videos: [], emptyFeed: true };
    }

    // Take top 12 subscribed channels to fetch newest uploads in parallel
    const selectedChannels = channelIds.slice(0, 12);
    const playlistPromises = selectedChannels.map(async (chId) => {
      const uploadsPlaylistId = chId.replace(/^UC/, 'UU');
      const pUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=3`;
      try {
        const pRes = await fetch(pUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        if (!pRes.ok) return [];
        const pData = await pRes.json();
        const pItems = pData.items || [];
        return pItems.map((item: any) => {
          const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
          if (!videoId) return null;
          const snippet = item.snippet;
          return {
            videoId,
            title: snippet?.title || 'Unknown Video',
            author: snippet?.channelTitle || snippet?.videoOwnerChannelTitle || 'YouTube Creator',
            publishedAt: snippet?.publishedAt || '',
            publishedTime: formatRelativeTime(snippet?.publishedAt),
            thumbnail:
              snippet?.thumbnails?.high?.url ||
              snippet?.thumbnails?.medium?.url ||
              snippet?.thumbnails?.default?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          };
        }).filter(Boolean);
      } catch {
        return [];
      }
    });

    const settled = await Promise.allSettled(playlistPromises);
    const rawVideos: any[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        rawVideos.push(...r.value);
      }
    }

    if (rawVideos.length === 0) {
      return { videos: [], emptyFeed: true };
    }

    // Sort by publishedAt descending (most recent first)
    rawVideos.sort((a, b) => {
      const timeA = new Date(a.publishedAt).getTime() || 0;
      const timeB = new Date(b.publishedAt).getTime() || 0;
      return timeB - timeA;
    });

    const topVideos = rawVideos.slice(0, maxResults);
    const videoIdList = topVideos.map((v) => v.videoId);

    // Enrich with durations & view counts
    const metaMap = await enrichVideosMetadata(videoIdList, token);

    const formattedVideos: YouTubeVideoSearchResult[] = topVideos.map((raw, idx) => {
      const meta = metaMap.get(raw.videoId);
      return {
        id: `yt_sub_${raw.videoId}`,
        videoId: raw.videoId,
        title: raw.title,
        author: raw.author,
        duration: meta?.duration || '3:30',
        durationSeconds: meta?.durationSeconds || 210,
        viewCount: meta?.viewCount || '',
        publishedTime: raw.publishedTime,
        thumbnail: raw.thumbnail,
        rank: idx + 1,
      };
    });

    userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
    return { videos: formattedVideos };
  } catch (err: any) {
    console.warn('[youtubeUserFeedService] fetchUserSubscriptionsFeed error:', err);
    return { videos: [], error: err?.message || 'Failed to fetch subscriptions feed.' };
  }
}

/**
 * Fetches user's official Liked Videos directly using YouTube Data API v3 videos.list(myRating=like).
 */
export async function fetchUserLikedVideos(maxResults = 30): Promise<UserFeedResult> {
  const token = await getGoogleYouTubeToken();
  if (!token) {
    return { videos: [], notConnected: true };
  }

  const cacheKey = `liked_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { videos: cached.videos };
  }

  try {
    // Primary: videos.list with myRating=like returns complete metadata in ONE call
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&myRating=like&maxResults=${maxResults}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 401) {
      console.warn('[youtubeUserFeedService] 401 Unauthorized - Google token expired');
      await clearGoogleYouTubeTokens();
      return { videos: [], requiresReauth: true, error: 'Your YouTube session expired. Please reconnect.' };
    }

    if (res.status === 403) {
      const errText = await res.text();
      console.warn('[youtubeUserFeedService] 403 Forbidden Liked Videos:', errText);
      const isScopeIssue =
        errText.includes('insufficient') ||
        errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        errText.includes('PERMISSION_DENIED');
      if (isScopeIssue) {
        await clearGoogleYouTubeTokens();
        return {
          videos: [],
          requiresReauth: true,
          error: 'YouTube read permission is required. Tap Grant YouTube Access below.',
        };
      }
      return { videos: [], error: 'YouTube API Access Forbidden. Check Google Cloud settings.' };
    }

    if (!res.ok) {
      // Fallback: try playlistItems with playlistId=LL
      console.warn('[youtubeUserFeedService] videos.list rating=like failed, trying playlistItems LL');
      const fallbackUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=LL&maxResults=${maxResults}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!fallbackRes.ok) {
        const errBody = await fallbackRes.text();
        return { videos: [], error: `YouTube API Error (${res.status})` };
      }

      const fbData = await fallbackRes.json();
      const fbItems = fbData.items || [];
      if (fbItems.length === 0) return { videos: [], emptyFeed: true };

      const vIds = fbItems
        .map((it: any) => it.contentDetails?.videoId || it.snippet?.resourceId?.videoId)
        .filter(Boolean);
      const metaMap = await enrichVideosMetadata(vIds, token);

      const fbVideos: YouTubeVideoSearchResult[] = fbItems.map((item: any, idx: number) => {
        const vId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        const snippet = item.snippet;
        const meta = metaMap.get(vId);
        return {
          id: `yt_liked_${vId}`,
          videoId: vId,
          title: snippet?.title || 'Unknown Track',
          author: snippet?.videoOwnerChannelTitle || snippet?.channelTitle || 'Liked Video',
          duration: meta?.duration || '3:30',
          durationSeconds: meta?.durationSeconds || 210,
          viewCount: meta?.viewCount || '',
          publishedTime: formatRelativeTime(snippet?.publishedAt),
          thumbnail:
            snippet?.thumbnails?.high?.url ||
            snippet?.thumbnails?.medium?.url ||
            `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
          rank: idx + 1,
        };
      });

      userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: fbVideos });
      return { videos: fbVideos };
    }

    const data = await res.json();
    const items = data.items || [];

    if (items.length === 0) {
      return { videos: [], emptyFeed: true };
    }

    const formattedVideos: YouTubeVideoSearchResult[] = items.map((item: any, idx: number) => {
      const snippet = item.snippet;
      const { formatted, seconds } = parseISO8601Duration(item.contentDetails?.duration);
      const viewCount = formatViewCount(item.statistics?.viewCount);
      return {
        id: `yt_liked_${item.id}`,
        videoId: item.id,
        title: snippet?.title || 'Liked Track',
        author: snippet?.channelTitle || 'YouTube Creator',
        duration: formatted,
        durationSeconds: seconds,
        viewCount,
        publishedTime: formatRelativeTime(snippet?.publishedAt),
        thumbnail:
          snippet?.thumbnails?.high?.url ||
          snippet?.thumbnails?.medium?.url ||
          snippet?.thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
        rank: idx + 1,
      };
    });

    userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
    return { videos: formattedVideos };
  } catch (err: any) {
    console.warn('[youtubeUserFeedService] fetchUserLikedVideos error:', err);
    return { videos: [], error: err?.message || 'Failed to fetch liked videos.' };
  }
}
