/**
 * YouTube Channel Avatar Service
 * Resolves, caches (in-memory + SafeStorage disk), and enriches YouTube channel avatars
 * across Trending, Charts, Search, and Auto-Play video results.
 */

import { SafeStorage } from './storage';

const CACHE_KEY_CHANNEL_AVATARS = '@shorty_yt_channel_avatars_v1';
const MAX_DISK_CACHE_ENTRIES = 300;

// In-memory fast cache keyed by channelId (UC...) and normalized author name
const avatarCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | null>>();
let isHydrated = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize cache from SafeStorage on load
 */
async function hydrateCache(): Promise<void> {
  if (isHydrated) return;
  try {
    const raw = await SafeStorage.getItem(CACHE_KEY_CHANNEL_AVATARS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const [key, url] of parsed) {
          if (key && url && typeof url === 'string') {
            avatarCache.set(key, url);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[youtubeAvatarService] Hydration error:', err);
  } finally {
    isHydrated = true;
  }
}

// Eagerly hydrate
hydrateCache().catch(() => {});

/**
 * Persist in-memory cache to SafeStorage with debounce
 */
function schedulePersist(): void {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(async () => {
    try {
      const entries = Array.from(avatarCache.entries()).slice(-MAX_DISK_CACHE_ENTRIES);
      await SafeStorage.setItem(CACHE_KEY_CHANNEL_AVATARS, JSON.stringify(entries));
    } catch {}
  }, 1000);
}

/**
 * Synchronous instant lookup for channel avatar
 */
export function getChannelAvatar(channelIdOrName?: string): string | undefined {
  if (!channelIdOrName) return undefined;
  const key = channelIdOrName.trim();
  const found = avatarCache.get(key) || avatarCache.get(key.toLowerCase());
  return found || undefined;
}

/**
 * Manually set / update cached channel avatar
 */
export function setCachedChannelAvatar(channelIdOrName: string, avatarUrl: string): void {
  if (!channelIdOrName || !avatarUrl || avatarUrl.includes('ui-avatars.com')) return;
  const cleanUrl = avatarUrl.startsWith('//') ? `https:${avatarUrl}` : avatarUrl;
  const key = channelIdOrName.trim();
  avatarCache.set(key, cleanUrl);
  avatarCache.set(key.toLowerCase(), cleanUrl);
  schedulePersist();
}

/**
 * Fetches a single channel's real YouTube avatar via InnerTube browse endpoint
 */
export async function fetchChannelAvatar(
  channelId: string,
  authorName?: string
): Promise<string | null> {
  if (!channelId) return null;
  const cleanId = channelId.trim();

  // Check cache first
  const cached = getChannelAvatar(cleanId) || (authorName ? getChannelAvatar(authorName) : undefined);
  if (cached) return cached;

  if (!cleanId.startsWith('UC')) {
    return null;
  }

  // Deduplicate in-flight requests
  const existing = inFlightRequests.get(cleanId);
  if (existing) return existing;

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const payload = {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240105.01.00',
            hl: 'en',
            gl: 'IN',
          },
        },
        browseId: cleanId,
        params: 'EgZ2aWRlb3PyBgQKAjoA', // Videos tab contains channel header
      };

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);

      const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json();

      // Check pageHeaderViewModel
      const phvm =
        data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel ||
        data.header?.pageHeaderRenderer?.pageHeaderViewModel;
      const phvmSources = phvm?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources;
      let avatarUrl = phvmSources?.[phvmSources.length - 1]?.url;

      // Fallback: legacy c4TabbedHeaderRenderer
      if (!avatarUrl) {
        const c4Thumbs = data.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails;
        avatarUrl = c4Thumbs?.[c4Thumbs.length - 1]?.url;
      }

      if (avatarUrl && typeof avatarUrl === 'string') {
        if (avatarUrl.startsWith('//')) avatarUrl = `https:${avatarUrl}`;
        setCachedChannelAvatar(cleanId, avatarUrl);
        if (authorName) setCachedChannelAvatar(authorName, avatarUrl);
        return avatarUrl;
      }
    } catch {
      // Quiet fail on network abort / timeout
    }
    return null;
  })();

  inFlightRequests.set(cleanId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cleanId);
  }
}

export interface VideoItemWithAvatar {
  channelId?: string;
  author?: string;
  channelAvatar?: string;
}

/**
 * Enriches an array of videos with real YouTube channel avatars in parallel.
 * Fast, non-blocking, and caches all results for 0ms future lookups.
 */
export async function enrichVideosWithChannelAvatars<T extends VideoItemWithAvatar>(
  videos: T[]
): Promise<T[]> {
  if (!videos || videos.length === 0) return videos;

  // Make sure cache has hydrated from disk
  if (!isHydrated) {
    await hydrateCache();
  }

  const missingChannels: { channelId: string; author?: string }[] = [];
  const seenChannelIds = new Set<string>();

  for (const v of videos) {
    // If it already has a real avatar (not ui-avatars fallback)
    if (v.channelAvatar && !v.channelAvatar.includes('ui-avatars.com')) {
      if (v.channelId) setCachedChannelAvatar(v.channelId, v.channelAvatar);
      if (v.author) setCachedChannelAvatar(v.author, v.channelAvatar);
      continue;
    }

    // Try finding in cache
    const cached =
      (v.channelId && getChannelAvatar(v.channelId)) ||
      (v.author && getChannelAvatar(v.author));

    if (cached) {
      v.channelAvatar = cached;
      continue;
    }

    // Collect uncached channel IDs
    if (v.channelId && v.channelId.startsWith('UC') && !seenChannelIds.has(v.channelId)) {
      seenChannelIds.add(v.channelId);
      missingChannels.push({ channelId: v.channelId, author: v.author });
    }
  }

  if (missingChannels.length === 0) return videos;

  // Fetch up to 25 unique channel avatars in parallel
  const batch = missingChannels.slice(0, 25);
  await Promise.allSettled(
    batch.map(async ({ channelId, author }) => {
      const avatar = await fetchChannelAvatar(channelId, author);
      if (avatar) {
        for (const v of videos) {
          if (
            v.channelId === channelId ||
            (author && v.author && v.author.toLowerCase().trim() === author.toLowerCase().trim())
          ) {
            v.channelAvatar = avatar;
          }
        }
      }
    })
  );

  return videos;
}
