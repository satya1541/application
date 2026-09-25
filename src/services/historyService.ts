import { Song } from '@/types/music';
import { SafeStorage } from './storage';
import { supabase, isSupabaseConfigured } from './supabase';

export interface HistoryEntry {
  id: string; // unique entry id or song id
  song: Song;
  playedAt: number; // epoch ms
  durationSeconds: number;
}

const HISTORY_STORAGE_KEY = '@shorty_playback_history_v2';
const MAX_HISTORY_ITEMS = 150;

/**
 * Validates if playback duration meets the meaningful threshold:
 * >= 30 seconds, or >= 50% of track length for tracks under 60 seconds.
 */
export function meetsPlaybackThreshold(durationListened: number, trackDuration: number): boolean {
  if (durationListened >= 5) {
    return true;
  }
  if (trackDuration > 0 && durationListened >= Math.min(5, trackDuration * 0.3)) {
    return true;
  }
  return durationListened >= 3;
}

/**
 * Formats epoch timestamp into 12-hour format e.g. "10:42 AM"
 */
export function formatHistoryTime(epochMs: number): string {
  const date = new Date(epochMs);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 -> 12
  const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minStr} ${ampm}`;
}

export interface GroupedHistory {
  today: HistoryEntry[];
  yesterday: HistoryEntry[];
  earlier: { dateLabel: string; items: HistoryEntry[] }[];
}

/**
 * Groups history entries into Today, Yesterday, and Earlier sections.
 */
export function groupHistoryByDate(entries: HistoryEntry[]): GroupedHistory {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const today: HistoryEntry[] = [];
  const yesterday: HistoryEntry[] = [];
  const earlierMap: Map<string, HistoryEntry[]> = new Map();

  for (const entry of entries) {
    if (entry.playedAt >= todayStart) {
      today.push(entry);
    } else if (entry.playedAt >= yesterdayStart) {
      yesterday.push(entry);
    } else {
      const d = new Date(entry.playedAt);
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (!earlierMap.has(label)) {
        earlierMap.set(label, []);
      }
      earlierMap.get(label)!.push(entry);
    }
  }

  const earlier: { dateLabel: string; items: HistoryEntry[] }[] = [];
  earlierMap.forEach((items, dateLabel) => {
    earlier.push({ dateLabel, items });
  });

  return { today, yesterday, earlier };
}

/**
 * Retrieves listening history sorted from newest to oldest.
 */
export async function getListeningHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await SafeStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: HistoryEntry[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[historyService] Failed to parse history:', err);
    return [];
  }
}

/**
 * Records a playback entry into history following all strict rules:
 * 1. Checks minimum threshold (>=30s or >=50%).
 * 2. Consecutive deduplication (updates existing entry timestamp if played again).
 * 3. Most recent first.
 * 4. Hard-capped at 150 items.
 */
export async function recordHistoryEntry(
  song: Song,
  durationListened: number,
  totalDuration: number,
  userId?: string | null
): Promise<boolean> {
  if (!song || !song.id) return false;

  const valid = meetsPlaybackThreshold(durationListened, totalDuration || song.duration || 0);
  if (!valid) {
    return false;
  }

  try {
    const existing = await getListeningHistory();
    const now = Date.now();

    // Deduplication rule: If the very top (most recent) item is the same song,
    // just update its timestamp instead of creating a duplicate entry.
    if (existing.length > 0 && existing[0].song.id === song.id) {
      existing[0].playedAt = now;
      existing[0].durationSeconds = Math.max(existing[0].durationSeconds, Math.round(durationListened));
      await SafeStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(existing));
      return true;
    }

    // Keep only the latest instance of any song so re-plays move to the top without duplicate entries
    const filtered = existing.filter((e) => e.song.id !== song.id);

    const newEntry: HistoryEntry = {
      id: `${song.id}_${now}`,
      song,
      playedAt: now,
      durationSeconds: Math.round(durationListened),
    };

    const updated = [newEntry, ...filtered];

    // Enforce 150 item hard cap
    if (updated.length > MAX_HISTORY_ITEMS) {
      updated.length = MAX_HISTORY_ITEMS;
    }

    await SafeStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));

    // Also persist to Supabase if logged in
    if (isSupabaseConfigured() && userId) {
      Promise.resolve(
        supabase.from('listening_history').insert({
          user_id: userId,
          song_id: song.id,
          song_title: song.name,
          artist: song.artist,
          cover_url: song.cover,
          duration_seconds: Math.round(durationListened),
        })
      ).catch((e: any) => console.warn('[historyService] Cloud sync error:', e));
    }

    return true;
  } catch (err) {
    console.warn('[historyService] Error recording history entry:', err);
    return false;
  }
}

/**
 * Clears the entire listening history locally and from Supabase.
 */
export async function clearHistory(userId?: string | null): Promise<boolean> {
  try {
    await SafeStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([]));
    if (isSupabaseConfigured() && userId) {
      await supabase.from('listening_history').delete().eq('user_id', userId);
    }
    return true;
  } catch (err) {
    console.warn('[historyService] Error clearing history:', err);
    return false;
  }
}


/**
 * Prunes listening history older than 7 days locally and in Supabase.
 */
export async function pruneWeeklyHistory(userId?: string | null, daysToKeep = 7): Promise<void> {
  const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  try {
    const existing = await getListeningHistory();
    const filtered = existing.filter((e) => e.playedAt >= cutoffTime);
    if (filtered.length !== existing.length) {
      await SafeStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered));
    }

    if (isSupabaseConfigured() && userId) {
      const cutoffIso = new Date(cutoffTime).toISOString();
      await supabase
        .from('listening_history')
        .delete()
        .eq('user_id', userId)
        .lt('played_at', cutoffIso);
    }
  } catch (err) {
    console.warn('[historyService] Error pruning weekly history:', err);
  }
}
