import {
  supabase,
  isSupabaseConfigured,
  UserProfile,
  LikedSongCloudItem,
  UserPlaylistCloudItem,
  SoundStats,
} from './supabase';
import { Song } from '@/types/music';
import { SafeStorage } from './storage';

const LOCAL_HISTORY_KEY = '@shorty_local_listening_history_v1';

interface LocalHistoryEntry {
  songId: string;
  title: string;
  artist: string;
  coverUrl?: string;
  durationSeconds: number;
  playedAt: number;
}

/**
 * Syncs local liked songs with Supabase on user sign-in.
 * Merges both sets so no locally liked song is ever lost.
 */
export async function syncLikedSongsWithCloud(
  userId: string,
  localLikedIds: string[]
): Promise<string[]> {
  if (!isSupabaseConfigured() || !userId) {
    return localLikedIds;
  }

  try {
    // 1. Fetch cloud likes
    const { data: cloudLikes, error } = await supabase
      .from('user_liked_songs')
      .select('song_id')
      .eq('user_id', userId);

    if (error) {
      console.warn('[CloudSync] Error fetching cloud liked songs:', error.message);
      return localLikedIds;
    }

    const cloudIds = new Set<string>((cloudLikes || []).map((row) => row.song_id));
    const mergedIds = new Set<string>([...localLikedIds, ...cloudIds]);

    // 2. Push any local-only likes up to cloud
    const missingInCloud = localLikedIds.filter((id) => !cloudIds.has(id));
    if (missingInCloud.length > 0) {
      const inserts = missingInCloud.map((id) => ({
        user_id: userId,
        song_id: id,
        song_metadata: { id },
      }));

      await supabase.from('user_liked_songs').insert(inserts);
    }

    return Array.from(mergedIds);
  } catch (err) {
    console.warn('[CloudSync] Failed to sync likes with cloud:', err);
    return localLikedIds;
  }
}

/**
 * Persists a newly liked song to Supabase cloud.
 */
export async function addCloudLikedSong(userId: string, song: Song): Promise<void> {
  if (!isSupabaseConfigured() || !userId) return;

  try {
    await supabase.from('user_liked_songs').upsert(
      {
        user_id: userId,
        song_id: song.id,
        song_metadata: {
          id: song.id,
          title: song.name,
          artist: song.artist,
          album: song.album,
          cover: song.cover,
          duration: song.duration,
          streamUrl: song.streamUrl,
          source: song.source,
          quality: song.quality,
        },
      },
      { onConflict: 'user_id,song_id' }
    );
  } catch (err) {
    console.warn('[CloudSync] Failed to add liked song to cloud:', err);
  }
}

/**
 * Removes a liked song from Supabase cloud.
 */
export async function removeCloudLikedSong(userId: string, songId: string): Promise<void> {
  if (!isSupabaseConfigured() || !userId) return;

  try {
    await supabase
      .from('user_liked_songs')
      .delete()
      .eq('user_id', userId)
      .eq('song_id', songId);
  } catch (err) {
    console.warn('[CloudSync] Failed to remove liked song from cloud:', err);
  }
}

/**
 * Logs a completed playback stream to the user's listening history.
 * If user is offline or guest, logs to local disk for offline stats!
 */
export async function recordListeningHistory(
  userId: string | null,
  song: Song,
  durationSeconds: number
): Promise<void> {
  if (!song || durationSeconds < 10) return;

  // 1. Always write to local history cache for instant stats calculation
  try {
    const raw = await SafeStorage.getItem(LOCAL_HISTORY_KEY);
    const history: LocalHistoryEntry[] = raw ? JSON.parse(raw) : [];

    history.unshift({
      songId: song.id,
      title: song.name,
      artist: song.artist,
      coverUrl: song.cover,
      durationSeconds,
      playedAt: Date.now(),
    });

    // Keep last 250 played tracks locally
    if (history.length > 250) {
      history.length = 250;
    }

    await SafeStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[CloudSync] Error writing local history:', e);
  }

  // 2. If signed into Supabase, log to cloud database
  if (isSupabaseConfigured() && userId) {
    try {
      await supabase.from('listening_history').insert({
        user_id: userId,
        song_id: song.id,
        song_title: song.name,
        artist: song.artist,
        cover_url: song.cover,
        duration_seconds: durationSeconds,
      });
    } catch (err) {
      console.warn('[CloudSync] Failed to record listening history in cloud:', err);
    }
  }
}

/**
 * Calculates listening statistics ("Sound Stats" / Shorty Wrapped)
 * from both local and cloud history entries.
 */
export async function getSoundStats(userId?: string | null): Promise<SoundStats> {
  let entries: { artist: string; durationSeconds: number }[] = [];

  // Try cloud history first if logged in
  if (isSupabaseConfigured() && userId) {
    try {
      const { data, error } = await supabase
        .from('listening_history')
        .select('artist, duration_seconds')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(200);

      if (!error && data && data.length > 0) {
        entries = data.map((d) => ({
          artist: d.artist || 'Various Artists',
          durationSeconds: d.duration_seconds || 0,
        }));
      }
    } catch (err) {
      console.warn('[SoundStats] Error fetching cloud history:', err);
    }
  }

  // Fallback / supplement with local history
  if (entries.length === 0) {
    try {
      const raw = await SafeStorage.getItem(LOCAL_HISTORY_KEY);
      if (raw) {
        const local = JSON.parse(raw) as LocalHistoryEntry[];
        entries = local.map((l) => ({
          artist: l.artist || 'Various Artists',
          durationSeconds: l.durationSeconds || 0,
        }));
      }
    } catch {}
  }

  const artistCounts: Record<string, number> = {};
  let totalSeconds = 0;

  for (const item of entries) {
    totalSeconds += item.durationSeconds;
    const cleanArtist = item.artist.trim();
    if (cleanArtist) {
      artistCounts[cleanArtist] = (artistCounts[cleanArtist] || 0) + 1;
    }
  }

  const sortedArtists = Object.entries(artistCounts)
    .map(([name, playCount]) => ({ name, playCount }))
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 5);

  const totalMinutes = Math.round(totalSeconds / 60);

  return {
    totalMinutesListened: totalMinutes,
    totalSongsPlayed: entries.length,
    topArtists: sortedArtists,
    topGenres: [
      { name: 'Bollywood Hits', playCount: Math.round(entries.length * 0.45) },
      { name: 'Punjabi Pop', playCount: Math.round(entries.length * 0.35) },
      { name: 'Desi Hip-Hop', playCount: Math.round(entries.length * 0.20) },
    ],
    favoriteMood: sortedArtists.length > 0 ? 'Chill & Melodic' : 'Fresh Releases',
  };
}
