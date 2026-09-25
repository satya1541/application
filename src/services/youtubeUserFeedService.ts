/**
 * YouTube User Feed Service
 * Fetches personalized YouTube Subscriptions Feed, Liked Videos, and Playlists
 * using the user's authenticated Google Account (OAuth provider_token).
 */

import { SafeStorage } from './storage';
import { YouTubeVideoSearchResult } from './youtubeVideoSearchService';

export const GOOGLE_YOUTUBE_TOKEN_KEY = '@shorty_google_youtube_token';
export const GOOGLE_YOUTUBE_REFRESH_TOKEN_KEY = '@shorty_google_youtube_refresh_token';
export const GOOGLE_YOUTUBE_CONNECTED_KEY = '@shorty_google_youtube_connected';
export const GOOGLE_YOUTUBE_SUBSCRIPTIONS_KEY = '@shorty_user_subscribed_channels';
export const CACHED_USER_FEED_KEY = '@shorty_cached_user_feed';
export const CACHED_LIKED_FEED_KEY = '@shorty_cached_liked_feed';

export interface SubscribedChannel {
  channelId: string;
  title: string;
  thumbnail?: string;
  lastUpdated?: number;
}

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
 * Fetches recent video uploads from a YouTube channel via official public RSS / Atom feed.
 * Completely immune to OAuth token expiration, runs 100% reliably 24/7 without authentication.
 */
export async function fetchChannelRssUploads(channelId: string, limit = 3): Promise<any[]> {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/atom+xml,application/xml,text/xml',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const xml = await res.text();
    const entries = xml.split('<entry>');
    entries.shift(); // remove header

    const videos: any[] = [];
    for (const entry of entries) {
      const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const authorMatch = entry.match(/<name>([^<]+)<\/name>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      const thumbMatch = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/);

      if (videoIdMatch && videoIdMatch[1]) {
        const videoId = videoIdMatch[1].trim();
        const rawTitle = titleMatch ? titleMatch[1].trim() : 'Unknown Video';
        const cleanTitle = rawTitle
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

        videos.push({
          videoId,
          title: cleanTitle,
          author: authorMatch ? authorMatch[1].trim() : 'YouTube Creator',
          publishedAt: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
          publishedTime: formatRelativeTime(publishedMatch ? publishedMatch[1].trim() : undefined),
          thumbnail: thumbMatch ? thumbMatch[1].trim() : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });

        if (videos.length >= limit) break;
      }
    }
    return videos;
  } catch {
    return [];
  }
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
}

/**
 * Fetches user's Subscriptions Feed (latest uploads from subscribed channels).
 * First checks active OAuth token; on expiration or offline, seamlessly falls back to
 * stored channel subscriptions + public RSS channel feeds with 0ms interruption.
 */
export async function fetchUserSubscriptionsFeed(maxResults = 30): Promise<UserFeedResult> {
  const token = await getGoogleYouTubeToken();
  const isConnected = await isYouTubeConnected();
  const cachedFromStorage = await getCachedUserFeed();

  // If user never connected YouTube at all and has no cached videos
  if (!isConnected && !token && cachedFromStorage.length === 0) {
    return {
      videos: [],
      notConnected: true,
      requiresReauth: false,
    };
  }

  const cacheKey = `subscriptions_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.videos.length > 0) {
    return { videos: cached.videos };
  }

  // Resilient RSS fallback for stored channels
  const fetchFromStoredChannelsRss = async (): Promise<YouTubeVideoSearchResult[] | null> => {
    try {
      const storedChannels = await getStoredSubscribedChannels();
      if (!storedChannels || storedChannels.length === 0) return null;

      const topChannels = storedChannels.slice(0, 15);
      const settled = await Promise.allSettled(
        topChannels.map((c) => fetchChannelRssUploads(c.channelId, 3))
      );

      const rawVideos: any[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          rawVideos.push(...r.value);
        }
      }

      if (rawVideos.length === 0) return null;

      rawVideos.sort((a, b) => {
        const timeA = new Date(a.publishedAt).getTime() || 0;
        const timeB = new Date(b.publishedAt).getTime() || 0;
        return timeB - timeA;
      });

      const topVideos = rawVideos.slice(0, maxResults);
      const formattedVideos: YouTubeVideoSearchResult[] = topVideos.map((raw, idx) => ({
        id: `yt_sub_${raw.videoId}`,
        videoId: raw.videoId,
        title: raw.title,
        author: raw.author,
        duration: '3:30',
        durationSeconds: 210,
        viewCount: '',
        publishedTime: raw.publishedTime,
        thumbnail: raw.thumbnail,
        rank: idx + 1,
        isLive: false,
      }));

      userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
      SafeStorage.setItem(CACHED_USER_FEED_KEY, JSON.stringify(formattedVideos)).catch(() => {});
      return formattedVideos;
    } catch (e) {
      console.warn('[youtubeUserFeedService] RSS fallback error:', e);
      return null;
    }
  };

  try {
    // If active OAuth token is present, attempt official YouTube API
    if (token) {
      const subUrl = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=25`;
      const subRes = await fetch(subUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        const channels = subData.items || [];

        // Save channel IDs & metadata for offline / token-expired resilient RSS fallback
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
        }

        const channelIds = extractedChannels.map((c) => c.channelId);
        if (channelIds.length > 0) {
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
              if (!pRes.ok) {
                return await fetchChannelRssUploads(chId, 3);
              }
              const pData = await pRes.json();
              const pItems = pData.items || [];
              return pItems
                .map((item: any) => {
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
                })
                .filter(Boolean);
            } catch {
              return await fetchChannelRssUploads(chId, 3);
            }
          });

          const settled = await Promise.allSettled(playlistPromises);
          const rawVideos: any[] = [];
          for (const r of settled) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              rawVideos.push(...r.value);
            }
          }

          if (rawVideos.length > 0) {
            rawVideos.sort((a, b) => {
              const timeA = new Date(a.publishedAt).getTime() || 0;
              const timeB = new Date(b.publishedAt).getTime() || 0;
              return timeB - timeA;
            });

            const topVideos = rawVideos.slice(0, maxResults);
            const videoIdList = topVideos.map((v) => v.videoId);
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
                isLive: meta?.isLive || false,
              };
            });

            userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
            SafeStorage.setItem(CACHED_USER_FEED_KEY, JSON.stringify(formattedVideos)).catch(() => {});
            return { videos: formattedVideos };
          }
        }
      } else {
        console.log(`[youtubeUserFeedService] YouTube API responded with status ${subRes.status}, switching to resilient RSS feed`);
      }
    }

    // Token expired (401), not provided, or API returned non-OK:
    // Seamlessly fetch new uploads using stored subscriptions RSS without bothering the user!
    const rssVideos = await fetchFromStoredChannelsRss();
    if (rssVideos && rssVideos.length > 0) {
      return { videos: rssVideos };
    }

    // Fall back to persistent storage cache
    if (cachedFromStorage.length > 0) {
      return { videos: cachedFromStorage };
    }

    // If completely empty and no connection at all
    return {
      videos: [],
      notConnected: !isConnected,
      emptyFeed: isConnected,
    };
  } catch (err: any) {
    console.warn('[youtubeUserFeedService] fetchUserSubscriptionsFeed error:', err);
    const rssVideos = await fetchFromStoredChannelsRss();
    if (rssVideos && rssVideos.length > 0) {
      return { videos: rssVideos };
    }
    return {
      videos: cachedFromStorage,
      error: cachedFromStorage.length === 0 ? 'Failed to fetch subscriptions feed.' : undefined,
    };
  }
}

/**
 * Fetches user's official Liked Videos directly using YouTube Data API v3 videos.list(myRating=like).
 * Seamlessly caches videos locally so they remain accessible even if OAuth token expires.
 */
export async function fetchUserLikedVideos(maxResults = 30): Promise<UserFeedResult> {
  const token = await getGoogleYouTubeToken();
  const isConnected = await isYouTubeConnected();
  const cachedFromStorage = await getCachedLikedVideos();

  if (!isConnected && !token && cachedFromStorage.length === 0) {
    return {
      videos: [],
      notConnected: true,
      requiresReauth: false,
    };
  }

  const cacheKey = `liked_${maxResults}`;
  const cached = userFeedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.videos.length > 0) {
    return { videos: cached.videos };
  }

  try {
    if (token) {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&myRating=like&maxResults=${maxResults}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          const formattedVideos: YouTubeVideoSearchResult[] = items.map((item: any, idx: number) => {
            const snippet = item.snippet;
            const isLive = snippet?.liveBroadcastContent === 'live';
            const { formatted, seconds } = parseISO8601Duration(item.contentDetails?.duration);
            const viewCount = formatViewCount(item.statistics?.viewCount);
            return {
              id: `yt_liked_${item.id}`,
              videoId: item.id,
              title: snippet?.title || 'Liked Track',
              author: snippet?.channelTitle || 'YouTube Creator',
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

          userFeedCache.set(cacheKey, { timestamp: Date.now(), videos: formattedVideos });
          SafeStorage.setItem(CACHED_LIKED_FEED_KEY, JSON.stringify(formattedVideos)).catch(() => {});
          return { videos: formattedVideos };
        }
      }
    }

    // If token expired (401) or absent, seamlessly return cached liked videos without annoying warning banners
    if (cachedFromStorage.length > 0) {
      return { videos: cachedFromStorage };
    }

    return { videos: [], emptyFeed: true };
  } catch (err: any) {
    console.warn('[youtubeUserFeedService] fetchUserLikedVideos error:', err);
    return {
      videos: cachedFromStorage,
      error: cachedFromStorage.length === 0 ? 'Failed to fetch liked videos.' : undefined,
    };
  }
}
