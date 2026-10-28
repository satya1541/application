/**
 * YouTube User Feed Service
 * Fetches personalized YouTube Subscriptions Feed, Liked Videos, and Playlists
 * using the user's authenticated Google Account (OAuth provider_token) or high-resilience
 * InnerTube endpoints with local like and caching fallbacks.
 */

import { SafeStorage } from './storage';
import { YouTubeVideoSearchResult } from './youtubeVideoSearchService';
import { getChannelAvatar, setCachedChannelAvatar } from './youtubeAvatarService';
import { getStoredLikedSongs } from './userPlaylistService';

export const GOOGLE_YOUTUBE_TOKEN_KEY = '@shorty_google_youtube_token';
export const GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY = '@shorty_google_youtube_refresh_token';
export const GOOGLE_YOUTUBE_CONNECTED_KEY = '@shorty_google_youtube_connected';
export const GOOGLE_YOUTUBE_SUBSCRIPTIONS_KEY = '@shorty_user_subscribed_channels';
export const CACHED_USER_FEED_KEY = '@shorty_cached_user_feed';
export const CACHED_LIKED_FEED_KEY = '@shorty_cached_liked_feed';
export const LOCAL_LIKED_VIDEOS_KEY = '@shorty_local_liked_videos_v1';

export interface SubscribedChannel {
  channelId: string;
  title: string;
  thumbnail?: string;
  lastUpdated?: number;
}

export const DEFAULT_STARTER_CHANNELS: SubscribedChannel[] = [
  { channelId: 'UCq-Fj5jknLsUf-MWSy4_brA', title: 'T-Series' },
  { channelId: 'UC56gTxKC445i-0j5q0s9w1w', title: 'Sony Music India' },
  { channelId: 'UCFFbwnve3yF62-tVXkTyHqg', title: 'Zee Music Company' },
  { channelId: 'UCbTLwN10NoCU4WDzLf1JMOA', title: 'YRF' },
  { channelId: 'UCnoZXdE9yKqVl7Ua0z6p7vA', title: 'Speed Records' },
  { channelId: 'UCNAqh0o_2wG9_gLg5-EeVcg', title: 'Tips Official' },
];

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
 * Automatically refresh Google OAuth access token using stored refresh token.
 */
export async function refreshGoogleYouTubeToken(): Promise<string | null> {
  try {
    const refreshToken = await SafeStorage.getItem(GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return null;

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      console.warn('[youtubeUserFeedService] Refresh token failed with status:', res.status);
      return null;
    }

    const data = await res.json();
    if (data.access_token) {
      inMemoryToken = data.access_token;
      await SafeStorage.setItem(GOOGLE_YOUTUBE_TOKEN_KEY, data.access_token);
      console.log('[youtubeUserFeedService] Successfully refreshed Google access token');
      return data.access_token;
    }
  } catch (err) {
    console.warn('[youtubeUserFeedService] Failed to refresh Google access token:', err);
  }
  return null;
}

/**
 * Get previously cached User Feed videos from persistent storage (0ms offline/startup load).
 */
export async function getCachedUserFeed(): Promise<YouTubeVideoSearchResult[]> {
  try {
    const raw = await SafeStorage.getItem(CACHED_USER_FEED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Get previously cached Liked Videos from persistent storage (0ms offline/startup load).
 */
export async function getCachedLikedVideos(): Promise<YouTubeVideoSearchResult[]> {
  try {
    const raw = await SafeStorage.getItem(CACHED_LIKED_FEED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Get locally persisted list of user's subscribed YouTube channels.
 */
export async function getStoredSubscribedChannels(): Promise<SubscribedChannel[]> {
  try {
    const raw = await SafeStorage.getItem(GOOGLE_YOUTUBE_SUBSCRIPTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Persist user's subscribed YouTube channels for offline / token-expired resilient browsing.
 */
export async function saveStoredSubscribedChannels(channels: SubscribedChannel[]): Promise<void> {
  try {
    if (Array.isArray(channels) && channels.length > 0) {
      await SafeStorage.setItem(GOOGLE_YOUTUBE_SUBSCRIPTIONS_KEY, JSON.stringify(channels));
    }
  } catch {}
}

/**
 * Get locally stored liked YouTube videos.
 */
export async function getStoredLocalLikedVideos(): Promise<YouTubeVideoSearchResult[]> {
  try {
    const raw = await SafeStorage.getItem(LOCAL_LIKED_VIDEOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Save / toggle a video in local liked videos.
 */
export async function saveLocalLikedVideo(
  video: YouTubeVideoSearchResult
): Promise<YouTubeVideoSearchResult[]> {
  try {
    const current = await getStoredLocalLikedVideos();
    const filtered = current.filter((v) => v.videoId !== video.videoId);
    const updated = [video, ...filtered];
    await SafeStorage.setItem(LOCAL_LIKED_VIDEOS_KEY, JSON.stringify(updated));
    userFeedCache.delete('liked_30');
    userFeedCache.delete('liked_50');
    return updated;
  } catch (err) {
    console.warn('[youtubeUserFeedService] saveLocalLikedVideo error:', err);
    return [];
  }
}

/**
 * Remove a video from local liked videos.
 */
export async function removeLocalLikedVideo(
  videoId: string
): Promise<YouTubeVideoSearchResult[]> {
  try {
    const current = await getStoredLocalLikedVideos();
    const updated = current.filter((v) => v.videoId !== videoId);
    await SafeStorage.setItem(LOCAL_LIKED_VIDEOS_KEY, JSON.stringify(updated));
    userFeedCache.delete('liked_30');
    userFeedCache.delete('liked_50');
    return updated;
  } catch (err) {
    console.warn('[youtubeUserFeedService] removeLocalLikedVideo error:', err);
    return [];
  }
}

/**
 * Check if a YouTube video is liked locally.
 */
export async function isLocalVideoLiked(videoId: string): Promise<boolean> {
  try {
    const current = await getStoredLocalLikedVideos();
    return current.some((v) => v.videoId === videoId);
  } catch {
    return false;
  }
}

/**
 * Save Google OAuth tokens after successful Google login and mark connected state permanently.
 */
export async function saveGoogleYouTubeTokens(
  accessToken: string,
  refreshToken?: string | null
): Promise<void> {
  inMemoryToken = accessToken;
  await SafeStorage.setItem(GOOGLE_YOUTUBE_CONNECTED_KEY, 'true');
  await SafeStorage.setItem(GOOGLE_YOUTUBE_TOKEN_KEY, accessToken);
  if (refreshToken) {
    await SafeStorage.setItem(GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY, refreshToken);
  }
}

/**
 * Clear stored Google tokens, connected state, and cached feeds ONLY on explicit logout.
 */
export async function clearGoogleYouTubeTokens(): Promise<void> {
  inMemoryToken = null;
  userFeedCache.clear();
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_CONNECTED_KEY);
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_TOKEN_KEY);
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY);
  await SafeStorage.removeItem(GOOGLE_YOUTUBE_SUBSCRIPTIONS_KEY);
  await SafeStorage.removeItem(CACHED_USER_FEED_KEY);
  await SafeStorage.removeItem(CACHED_LIKED_FEED_KEY);
}

/**
 * Checks whether a Google YouTube account connection is active and saved in cache / db.
 */
export async function isYouTubeConnected(): Promise<boolean> {
  if (inMemoryToken) return true;
  try {
    const isConn = await SafeStorage.getItem(GOOGLE_YOUTUBE_CONNECTED_KEY);
    if (isConn === 'true') return true;
    const token = await SafeStorage.getItem(GOOGLE_YOUTUBE_TOKEN_KEY);
    if (token) return true;
    const channels = await getStoredSubscribedChannels();
    if (channels.length > 0) return true;
    const cachedFeed = await getCachedUserFeed();
    if (cachedFeed.length > 0) return true;
  } catch {}
  return false;
}

/**
 * Parses string duration ("1:49" or "1:02:15") to seconds.
 */
function parseDurationToSeconds(durationStr?: string): number {
  if (!durationStr) return 210;
  const parts = durationStr.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 210;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 210;
}

/**
 * Fetches recent video uploads from a YouTube channel via InnerTube browse endpoint.
 * Highly robust, immune to OAuth token expiration, runs 100% reliably without authentication.
 */
export async function fetchChannelUploadsInnerTube(
  channelId: string,
  limit = 4
): Promise<any[]> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240105.01.00',
            hl: 'en',
            gl: 'IN',
          },
        },
        browseId: channelId,
        params: 'EgZ2aWRlb3PyBgQKAjoA', // Channel "Videos" tab filter
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const data = await res.json();
    const videos: any[] = [];

    // Parse modern lockupViewModel structure
    const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
    const videosTab = tabs?.find((t: any) => t.tabRenderer?.content?.richGridRenderer);
    const contents = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

    for (const item of contents) {
      const lockup = item?.richItemRenderer?.content?.lockupViewModel;
      if (lockup) {
        const videoId =
          lockup.contentId ||
          lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId;
        if (videoId && typeof videoId === 'string' && videoId.length === 11) {
          const meta = lockup.metadata?.lockupMetadataViewModel;
          const rawTitle =
            meta?.title?.content ||
            lockup.rendererContext?.accessibilityContext?.label ||
            'Unknown Video';
          const title = rawTitle.replace(/\s+\d+\s+minutes?,\s+\d+\s+seconds?$/i, '').trim();

          const thumbs = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
          const thumbnail =
            thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          let duration = '3:30';
          let durationSeconds = 210;
          const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
          for (const ov of overlays) {
            const badges = ov?.thumbnailBottomOverlayViewModel?.badges || [];
            for (const b of badges) {
              if (b.thumbnailBadgeViewModel?.text) {
                duration = b.thumbnailBadgeViewModel.text;
                const parsed = parseDurationToSeconds(duration);
                if (parsed > 0) durationSeconds = parsed;
                break;
              }
            }
          }

          let viewCount = '';
          let publishedTime = '';
          const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
          for (const r of rows) {
            const parts = r.metadataParts || r.elements || [];
            for (const p of parts) {
              const textVal = p.text?.content || p.metadataElementRenderer?.text?.content || '';
              if (textVal.includes('view') || textVal.includes('watching')) {
                viewCount = textVal;
              } else if (
                textVal.includes('ago') ||
                textVal.includes('Streamed') ||
                textVal.includes('Premiered')
              ) {
                publishedTime = textVal;
              }
            }
          }

          videos.push({
            videoId,
            channelId,
            title,
            duration,
            durationSeconds,
            viewCount,
            publishedTime,
            thumbnail,
          });
          if (videos.length >= limit) break;
        }
      }
    }

    // Fallback parser if modern lockupViewModel wasn't used
    if (videos.length === 0) {
      const parseItems = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        const vr = obj.videoRenderer || obj.gridVideoRenderer || obj.compactVideoRenderer;
        if (vr && vr.videoId) {
          const videoId = vr.videoId;
          const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown Video';
          const duration = vr.lengthText?.simpleText || '3:30';
          const viewCount = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || '';
          const publishedTime = vr.publishedTimeText?.simpleText || '';
          const thumbs = vr.thumbnail?.thumbnails || [];
          const thumbnail =
            thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          videos.push({
            videoId,
            channelId,
            title,
            duration,
            durationSeconds: parseDurationToSeconds(duration),
            viewCount,
            publishedTime,
            thumbnail,
          });
          if (videos.length >= limit) return;
        }
        for (const k of Object.keys(obj)) {
          if (Array.isArray(obj[k])) {
            for (const c of obj[k]) {
              parseItems(c);
              if (videos.length >= limit) return;
            }
          } else if (typeof obj[k] === 'object' && obj[k] !== null) {
            parseItems(obj[k]);
            if (videos.length >= limit) return;
          }
        }
      };
      parseItems(data);
    }

    return videos;
  } catch (err) {
    console.warn(`[youtubeUserFeedService] fetchChannelUploadsInnerTube failed for ${channelId}:`, err);
    return [];
  }
}

/**
 * Fetches recent video uploads from a YouTube channel.
 * Delegates to high-speed InnerTube API with zero authentication requirement.
 */
export async function fetchChannelRssUploads(channelId: string, limit = 3): Promise<any[]> {
  return await fetchChannelUploadsInnerTube(channelId, limit);
}

/**
 * Background worker to prefetch and persist user's subscriptions and warmup feed cache.
 */
export async function prefetchAndCacheUserSubscriptions(token: string): Promise<void> {
  try {
    const subUrl = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50`;
    const res = await fetch(subUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    const channels = data.items || [];
    const extracted: SubscribedChannel[] = channels
      .map((c: any) => {
        const id = c.snippet?.resourceId?.channelId;
        const title = c.snippet?.title || '';
        const thumb = c.snippet?.thumbnails?.default?.url;
        return id && typeof id === 'string' && id.startsWith('UC')
          ? { channelId: id, title, thumbnail: thumb, lastUpdated: Date.now() }
          : null;
      })
      .filter((c: any): c is SubscribedChannel => !!c);

    if (extracted.length > 0) {
      await saveStoredSubscribedChannels(extracted);
      for (const ch of extracted) {
        if (ch.thumbnail) {
          setCachedChannelAvatar(ch.channelId, ch.thumbnail);
          setCachedChannelAvatar(ch.title, ch.thumbnail);
        }
      }
      console.log(`[youtubeUserFeedService] Prefetched & saved ${extracted.length} subscribed channels to persistent cache`);
    }

    // Warm initial feeds in background
    fetchUserSubscriptionsFeed(30).catch(() => {});
    fetchUserLikedVideos(30).catch(() => {});
  } catch (err) {
    console.warn('[youtubeUserFeedService] Error in prefetchAndCacheUserSubscriptions:', err);
  }
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
): Promise<Map<string, { duration: string; durationSeconds: number; viewCount: string; isLive?: boolean }>> {
  const metaMap = new Map<string, { duration: string; durationSeconds: number; viewCount: string; isLive?: boolean }>();
  if (videoIds.length === 0) return metaMap;

  try {
    const chunks = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      chunks.push(videoIds.slice(i, i + 50));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${chunk.join(',')}`;
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
          const isLive = item.snippet?.liveBroadcastContent === 'live';
          const { formatted, seconds } = parseISO8601Duration(item.contentDetails?.duration);
          const viewCount = formatViewCount(item.statistics?.viewCount);
          metaMap.set(item.id, {
            duration: isLive ? 'LIVE' : formatted,
            durationSeconds: isLive ? 0 : seconds,
            viewCount,
            isLive,
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
  isStarterFeed?: boolean;
}

/**
 * Fetches user's Subscriptions Feed (latest uploads from subscribed channels).
 * First checks active OAuth token; on expiration or offline, seamlessly falls back to
 * stored channel subscriptions or curated starter channels with 0ms interruption.
 */
export async function fetchUserSubscriptionsFeed(
  maxResults = 30,
  forceRefresh = false
): Promise<UserFeedResult> {
  let token = await getGoogleYouTubeToken();
  const cachedFromStorage = await getCachedUserFeed();

  const cacheKey = `subscriptions_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL && cached.videos.length > 0) {
    return { videos: cached.videos };
  }

  // Resilient worker for channels (stored user subscriptions OR starter channels)
  const fetchFromChannels = async (
    channelsToUse: SubscribedChannel[],
    isStarter: boolean
  ): Promise<YouTubeVideoSearchResult[] | null> => {
    try {
      if (!channelsToUse || channelsToUse.length === 0) return null;

      const channelThumbMap = new Map<string, string>();
      for (const ch of channelsToUse) {
        if (ch.thumbnail) {
          channelThumbMap.set(ch.channelId, ch.thumbnail);
          channelThumbMap.set(ch.title.toLowerCase().trim(), ch.thumbnail);
          setCachedChannelAvatar(ch.channelId, ch.thumbnail);
          setCachedChannelAvatar(ch.title, ch.thumbnail);
        }
      }

      const selected = forceRefresh
        ? [...channelsToUse].sort(() => Math.random() - 0.5).slice(0, 10)
        : channelsToUse.slice(0, 10);

      const perChannelLimit = Math.max(3, Math.ceil(maxResults / selected.length));
      const settled = await Promise.allSettled(
        selected.map((c) => fetchChannelUploadsInnerTube(c.channelId, perChannelLimit))
      );

      const rawVideos: any[] = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const ch = selected[i];
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          for (const v of r.value) {
            rawVideos.push({
              ...v,
              author: v.author && v.author !== 'YouTube Creator' ? v.author : ch.title,
            });
          }
        }
      }

      if (rawVideos.length === 0) return null;

      // Deduplicate by videoId
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const v of rawVideos) {
        if (!seen.has(v.videoId)) {
          seen.add(v.videoId);
          deduped.push(v);
        }
      }

      const topVideos = deduped.slice(0, maxResults);
      const formattedVideos: YouTubeVideoSearchResult[] = topVideos.map((raw, idx) => {
        const channelAvatar =
          channelThumbMap.get(raw.channelId) ||
          channelThumbMap.get(raw.author?.toLowerCase().trim()) ||
          (raw.channelId && getChannelAvatar(raw.channelId)) ||
          getChannelAvatar(raw.author) ||
          raw.channelAvatar ||
          undefined;

        return {
          id: `yt_sub_${raw.videoId}`,
          videoId: raw.videoId,
          channelId: raw.channelId,
          title: raw.title,
          author: raw.author,
          channelAvatar,
          duration: raw.duration || '3:30',
          durationSeconds: raw.durationSeconds || 210,
          viewCount: raw.viewCount || '',
          publishedTime: raw.publishedTime || '',
          thumbnail: raw.thumbnail,
          rank: idx + 1,
          isLive: false,
        };
      });

      userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
      SafeStorage.setItem(CACHED_USER_FEED_KEY, JSON.stringify(formattedVideos)).catch(() => {});
      return formattedVideos;
    } catch (e) {
      console.warn('[youtubeUserFeedService] fetchFromChannels error:', e);
      return null;
    }
  };

  try {
    // 1. If active OAuth token is present, attempt official YouTube API
    if (token) {
      const subUrl = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=25`;
      let subRes = await fetch(subUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      // On 401 Unauthorized, automatically attempt to refresh token
      if (subRes.status === 401) {
        console.log('[youtubeUserFeedService] Subscriptions access token expired, attempting auto-refresh...');
        const refreshedToken = await refreshGoogleYouTubeToken();
        if (refreshedToken) {
          token = refreshedToken;
          subRes = await fetch(subUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });
        }
      }

      if (subRes.ok) {
        const subData = await subRes.json();
        const channels = subData.items || [];

        const extractedChannels: SubscribedChannel[] = channels
          .map((c: any) => {
            const id = c.snippet?.resourceId?.channelId;
            const title = c.snippet?.title || '';
            const thumb = c.snippet?.thumbnails?.default?.url;
            return id && typeof id === 'string' && id.startsWith('UC')
              ? { channelId: id, title, thumbnail: thumb, lastUpdated: Date.now() }
              : null;
          })
          .filter((c: any): c is SubscribedChannel => !!c);

        if (extractedChannels.length > 0) {
          saveStoredSubscribedChannels(extractedChannels).catch(() => {});
          const feedFromLive = await fetchFromChannels(extractedChannels, false);
          if (feedFromLive && feedFromLive.length > 0) {
            return { videos: feedFromLive, isStarterFeed: false };
          }
        }
      } else {
        console.log(`[youtubeUserFeedService] YouTube API responded with status ${subRes.status}, falling back to resilient feed`);
      }
    }

    // 2. Fall back to stored subscribed channels
    const storedChannels = await getStoredSubscribedChannels();
    if (storedChannels.length > 0) {
      const feedFromStored = await fetchFromChannels(storedChannels, false);
      if (feedFromStored && feedFromStored.length > 0) {
        return { videos: feedFromStored, isStarterFeed: false };
      }
    }

    // 3. Fall back to cached feed in persistent storage if present
    if (cachedFromStorage.length > 0) {
      return { videos: cachedFromStorage };
    }

    // 4. Fall back to starter music channels so new / unlinked users always see music uploads
    const starterFeed = await fetchFromChannels(DEFAULT_STARTER_CHANNELS, true);
    if (starterFeed && starterFeed.length > 0) {
      return { videos: starterFeed, isStarterFeed: true };
    }

    return {
      videos: [],
      notConnected: !(await isYouTubeConnected()),
      emptyFeed: true,
    };
  } catch (err: any) {
    console.warn('[youtubeUserFeedService] fetchUserSubscriptionsFeed error:', err);
    if (cachedFromStorage.length > 0) {
      return { videos: cachedFromStorage };
    }
    const starterFeed = await fetchFromChannels(DEFAULT_STARTER_CHANNELS, true);
    if (starterFeed && starterFeed.length > 0) {
      return { videos: starterFeed, isStarterFeed: true };
    }
    return {
      videos: [],
      error: 'Failed to fetch subscriptions feed.',
    };
  }
}

/**
 * Fetches user's Liked Videos.
 * Seamlessly integrates Google YouTube liked videos with in-app liked tracks and local likes.
 */
export async function fetchUserLikedVideos(
  maxResults = 30,
  forceRefresh = false
): Promise<UserFeedResult> {
  let token = await getGoogleYouTubeToken();
  const cachedFromStorage = await getCachedLikedVideos();
  const localLikedVideos = await getStoredLocalLikedVideos();
  const inAppLikedSongs = await getStoredLikedSongs();

  // Convert in-app liked songs to YouTubeVideoSearchResult
  const inAppLikedVideos: YouTubeVideoSearchResult[] = [];
  inAppLikedSongs.forEach((s, idx) => {
    const videoId = s.id.startsWith('yt_')
      ? s.id.replace('yt_', '')
      : s.id.length === 11
      ? s.id
      : null;
    if (videoId) {
      inAppLikedVideos.push({
        id: `yt_liked_${videoId}`,
        videoId,
        title: s.name,
        author: s.artist,
        duration: s.duration
          ? `${Math.floor(s.duration / 60)}:${(s.duration % 60).toString().padStart(2, '0')}`
          : '3:30',
        durationSeconds: s.duration || 210,
        viewCount: '',
        publishedTime: '',
        thumbnail: s.cover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        rank: idx + 1,
        isLive: false,
      });
    }
  });

  const cacheKey = `liked_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL && cached.videos.length > 0) {
    // Merge any newer local likes into cached
    const seen = new Set<string>();
    const merged: YouTubeVideoSearchResult[] = [];
    for (const v of [...localLikedVideos, ...cached.videos, ...inAppLikedVideos]) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        merged.push(v);
      }
    }
    return { videos: merged };
  }

  let remoteVideos: YouTubeVideoSearchResult[] = [];

  try {
    if (token) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&myRating=like&maxResults=${maxResults}`;
      let res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      // On 401, auto-refresh token and retry
      if (res.status === 401) {
        console.log('[youtubeUserFeedService] Liked videos token expired, attempting auto-refresh...');
        const refreshedToken = await refreshGoogleYouTubeToken();
        if (refreshedToken) {
          token = refreshedToken;
          res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });
        }
      }

      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          remoteVideos = items.map((item: any, idx: number) => {
            const snippet = item.snippet;
            const isLive = snippet?.liveBroadcastContent === 'live';
            const { formatted, seconds } = parseISO8601Duration(item.contentDetails?.duration);
            const viewCount = formatViewCount(item.statistics?.viewCount);
            const authorName = snippet?.channelTitle || 'YouTube Creator';
            const channelId = snippet?.channelId || undefined;
            const channelAvatar =
              snippet?.thumbnails?.default?.url ||
              (channelId && getChannelAvatar(channelId)) ||
              getChannelAvatar(authorName) ||
              undefined;

            return {
              id: `yt_liked_${item.id}`,
              videoId: item.id,
              channelId,
              title: snippet?.title || 'Liked Track',
              author: authorName,
              channelAvatar,
              duration: isLive ? 'LIVE' : formatted,
              durationSeconds: isLive ? 0 : seconds,
              viewCount,
              publishedTime: formatRelativeTime(snippet?.publishedAt),
              thumbnail:
                snippet?.thumbnails?.high?.url ||
                snippet?.thumbnails?.medium?.url ||
                snippet?.thumbnails?.default?.url ||
                `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
              rank: idx + 1,
              isLive,
            };
          });

          SafeStorage.setItem(CACHED_LIKED_FEED_KEY, JSON.stringify(remoteVideos)).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[youtubeUserFeedService] fetchUserLikedVideos remote error:', err);
  }

  // Combine: localLikedVideos + remoteVideos + cachedFromStorage + inAppLikedVideos
  const basePool = remoteVideos.length > 0 ? remoteVideos : cachedFromStorage;
  const combined = [...localLikedVideos, ...basePool, ...inAppLikedVideos];

  // Deduplicate by videoId
  const seenIds = new Set<string>();
  const finalVideos: YouTubeVideoSearchResult[] = [];
  for (const v of combined) {
    if (!seenIds.has(v.videoId)) {
      seenIds.add(v.videoId);
      finalVideos.push(v);
    }
  }

  if (finalVideos.length > 0) {
    userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: finalVideos });
    return { videos: finalVideos };
  }

  return { videos: [], emptyFeed: true };
}
