/**
 * Gorse Recommendation Engine Client Service
 * Connects Shorty Music to self-hosted Gorse RecSys (https://reco.thynxai.cloud)
 */

import { Song } from '@/types/music';

const GORSE_API_URL = process.env.EXPO_PUBLIC_GORSE_API_URL || 'https://reco.thynxai.cloud';

export type GorseFeedbackType = 'play' | 'like' | 'skip' | 'finish';

interface GorseItemPayload {
  ItemId: string;
  IsHidden: boolean;
  Categories: string[];
  Timestamp: string;
  Labels: string[];
  Comment: string;
}

interface GorseFeedbackPayload {
  FeedbackType: GorseFeedbackType;
  UserId: string;
  ItemId: string;
  Timestamp: string;
}

// In-memory cache for items already synced during this session to avoid redundant network calls
const syncedItemsCache = new Set<string>();

// Fast in-memory cache for resolved Song objects by ID (LRU-like cache max 500 items)
const songObjectCache = new Map<string, Song>();

// Recommendation cache (3-minute TTL)
const recCache = new Map<string, { data: string[]; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000;

export function isGorseConfigured(): boolean {
  return Boolean(GORSE_API_URL && GORSE_API_URL.startsWith('http'));
}

/**
 * Register or update a track in Gorse's item database with full metadata in Comment.
 * Non-blocking fire-and-forget.
 */
export async function syncSongToGorse(song: Song): Promise<void> {
  if (!isGorseConfigured() || !song?.id) return;

  const songId = String(song.id);
  songObjectCache.set(songId, song);

  if (syncedItemsCache.has(songId)) return;
  syncedItemsCache.add(songId);

  try {
    const categories: string[] = [
      song.source || 'jiosaavn',
      (song as any).language || 'general',
    ].filter(Boolean);

    const individualArtists = (song.artist || '')
      .split(/[,/&|]/)
      .map((a) => a.trim())
      .filter(Boolean);

    const labels: string[] = [
      ...individualArtists,
      song.quality || 'Lossless',
      (song as any).language || 'Hindi',
      song.album,
    ].filter(Boolean) as string[];

    const songMeta = {
      id: songId,
      name: song.name,
      artist: song.artist,
      album: song.album || '',
      cover: song.cover || '',
      duration: song.duration || 0,
      streamUrl: song.streamUrl || '',
      quality: song.quality || 'Lossless',
      source: song.source || 'jiosaavn',
      language: (song as any).language || 'Hindi',
    };

    const payload: GorseItemPayload = {
      ItemId: songId,
      IsHidden: false,
      Categories: categories,
      Timestamp: new Date().toISOString(),
      Labels: labels,
      Comment: JSON.stringify(songMeta),
    };

    await fetch(`${GORSE_API_URL}/api/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.debug('[Gorse] syncSongToGorse failed:', err);
  }
}

/**
 * Record a user interaction signal (play, like, skip, finish) to Gorse.
 * Non-blocking fire-and-forget.
 */
export async function recordGorseFeedback(
  userId: string,
  song: Song,
  feedbackType: GorseFeedbackType
): Promise<void> {
  if (!isGorseConfigured() || !userId || !song?.id) return;

  // Background ensure the track exists in Gorse catalog
  syncSongToGorse(song).catch(() => {});

  try {
    const feedback: GorseFeedbackPayload[] = [
      {
        FeedbackType: feedbackType,
        UserId: String(userId),
        ItemId: String(song.id),
        Timestamp: new Date().toISOString(),
      },
    ];

    await fetch(`${GORSE_API_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });
  } catch (err) {
    console.debug(`[Gorse] recordFeedback (${feedbackType}) failed:`, err);
  }
}

/**
 * Fetch a Song object from Gorse by its ItemId.
 */
export async function getGorseSongById(songId: string): Promise<Song | null> {
  if (!songId) return null;

  // Check local memory cache first
  if (songObjectCache.has(songId)) {
    return songObjectCache.get(songId)!;
  }

  if (!isGorseConfigured()) return null;

  try {
    const res = await fetch(`${GORSE_API_URL}/api/item/${encodeURIComponent(songId)}`);
    if (!res.ok) return null;

    const item = await res.json();
    if (item && item.Comment) {
      try {
        const parsed = JSON.parse(item.Comment);
        if (parsed && parsed.name) {
          const song: Song = {
            id: parsed.id || item.ItemId,
            name: parsed.name,
            artist: parsed.artist || 'Unknown Artist',
            album: parsed.album || '',
            cover: parsed.cover || '',
            duration: parsed.duration || 0,
            streamUrl: parsed.streamUrl || '',
            quality: parsed.quality || 'Lossless',
            source: parsed.source || 'jiosaavn',
            language: parsed.language || 'Hindi',
            isRecommended: true,
            recommendReason: 'Recommended by Gorse ML ✨',
          };
          songObjectCache.set(songId, song);
          return song;
        }
      } catch {
        return null;
      }
    }
    return null;
  } catch (err) {
    console.debug(`[Gorse] getGorseSongById(${songId}) failed:`, err);
    return null;
  }
}

/**
 * Fetch personalized recommended song IDs for a specific user from Gorse.
 */
export async function getPersonalizedRecommendations(
  userId: string,
  count = 20
): Promise<string[]> {
  if (!isGorseConfigured() || !userId) return [];

  const cacheKey = `rec_${userId}_${count}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // 1. Try personal collaborative filtering
    const res = await fetch(`${GORSE_API_URL}/api/recommend/${encodeURIComponent(userId)}?n=${count}`);
    if (res.ok) {
      const ids: string[] = await res.json();
      if (Array.isArray(ids) && ids.length > 0) {
        recCache.set(cacheKey, { data: ids, timestamp: Date.now() });
        return ids;
      }
    }

    // 2. Cold-start fallback: Gorse non-personalized popular leaderboard
    const popRes = await fetch(`${GORSE_API_URL}/api/non-personalized/popular?n=${count}`);
    if (popRes.ok) {
      const popular = await popRes.json();
      if (Array.isArray(popular) && popular.length > 0) {
        const ids = popular.map((n: any) => (typeof n === 'string' ? n : n.Id || n.id)).filter(Boolean);
        if (ids.length > 0) {
          recCache.set(cacheKey, { data: ids, timestamp: Date.now() });
          return ids;
        }
      }
    }

    return [];
  } catch (err) {
    console.debug('[Gorse] getPersonalizedRecommendations failed:', err);
    return [];
  }
}

/**
 * Fetch similar song IDs ("Song Radio") for an item ID.
 */
export async function getSimilarSongIds(songId: string, count = 10): Promise<string[]> {
  if (!isGorseConfigured() || !songId) return [];

  const cacheKey = `similar_${songId}_${count}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // 1. Try item neighbors (tags & collaborative item-to-item)
    const res = await fetch(`${GORSE_API_URL}/api/item/${encodeURIComponent(songId)}/neighbors?n=${count}`);
    if (res.ok) {
      const neighbors = await res.json();
      if (Array.isArray(neighbors) && neighbors.length > 0) {
        const ids = neighbors.map((n: any) => (typeof n === 'string' ? n : n.Id || n.id)).filter(Boolean);
        if (ids.length > 0) {
          recCache.set(cacheKey, { data: ids, timestamp: Date.now() });
          return ids;
        }
      }
    }

    // 2. Fallback to Gorse popular leaderboard during cold-start (filter out the seed song itself)
    const popRes = await fetch(`${GORSE_API_URL}/api/non-personalized/popular?n=${count + 2}`);
    if (popRes.ok) {
      const popular = await popRes.json();
      if (Array.isArray(popular) && popular.length > 0) {
        const ids = popular
          .map((n: any) => (typeof n === 'string' ? n : n.Id || n.id))
          .filter((id) => id && id !== songId)
          .slice(0, count);
        if (ids.length > 0) {
          recCache.set(cacheKey, { data: ids, timestamp: Date.now() });
          return ids;
        }
      }
    }

    return [];
  } catch (err) {
    console.debug('[Gorse] getSimilarSongIds failed:', err);
    return [];
  }
}

/**
 * High-level function: Fetch full personalized Song[] objects for a user.
 */
export async function getGorseRecommendedSongs(
  userId: string,
  count = 10
): Promise<Song[]> {
  const ids = await getPersonalizedRecommendations(userId, count);
  if (!ids || ids.length === 0) return [];

  const songs: Song[] = [];
  for (const id of ids) {
    const song = await getGorseSongById(id);
    if (song) songs.push(song);
  }
  return songs;
}

/**
 * High-level function: Fetch full similar Song[] objects for Song Radio.
 */
export async function getGorseSimilarSongs(
  songId: string,
  count = 10
): Promise<Song[]> {
  const ids = await getSimilarSongIds(songId, count);
  if (!ids || ids.length === 0) return [];

  const songs: Song[] = [];
  for (const id of ids) {
    const song = await getGorseSongById(id);
    if (song) songs.push(song);
  }
  return songs;
}
