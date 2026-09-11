import { Song } from '@/types/music';
import { SafeStorage } from './storage';
import { supabase, isSupabaseConfigured } from './supabase';

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  songs: Song[];
}

const PLAYLISTS_STORAGE_KEY = '@shorty_custom_playlists_v1';
const LIKED_SONGS_METADATA_KEY = '@shorty_liked_songs_metadata_v1';

/**
 * Resolves current active authenticated user ID from argument or active session.
 */
async function getCurrentUserId(explicitUserId?: string | null): Promise<string | null> {
  if (explicitUserId) return explicitUserId;
  if (!isSupabaseConfigured()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

// ─── USER PLAYLISTS ───

export async function getUserPlaylists(): Promise<UserPlaylist[]> {
  try {
    const raw = await SafeStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: UserPlaylist[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[userPlaylistService] Failed to load playlists:', err);
    return [];
  }
}

export async function saveUserPlaylists(
  playlists: UserPlaylist[],
  explicitUserId?: string | null
): Promise<void> {
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));

  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid && playlists.length > 0) {
    try {
      const rows = playlists.map((p) => ({
        id: p.id,
        user_id: uid,
        name: p.name,
        description: p.description || '',
        cover_url: p.coverUrl || null,
        songs: p.songs || [],
        created_at: new Date(p.createdAt || Date.now()).toISOString(),
        updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
      }));
      await supabase.from('user_playlists').upsert(rows, { onConflict: 'id' });
    } catch (err) {
      console.warn('[userPlaylistService] Background cloud playlist sync error:', err);
    }
  }
}

/**
 * Syncs playlists bidirectionally with Supabase when a user signs in or views My Lib.
 * Merges cloud and local playlists by timestamp so no created playlist is ever lost.
 */
export async function syncUserPlaylistsWithCloud(userId: string): Promise<UserPlaylist[]> {
  if (!isSupabaseConfigured() || !userId) {
    return getUserPlaylists();
  }

  try {
    // 1. Fetch cloud playlists from Supabase
    const { data: remotePlaylists, error } = await supabase
      .from('user_playlists')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('[userPlaylistService] Error fetching cloud playlists:', error.message);
      return getUserPlaylists();
    }

    const localPlaylists = await getUserPlaylists();
    const remoteMap = new Map<string, any>((remotePlaylists || []).map((p) => [p.id, p]));
    const localMap = new Map<string, UserPlaylist>(localPlaylists.map((p) => [p.id, p]));

    const mergedList: UserPlaylist[] = [];
    const playlistsToPush: UserPlaylist[] = [];

    // Process all local playlists
    for (const local of localPlaylists) {
      if (remoteMap.has(local.id)) {
        const remote = remoteMap.get(local.id);
        const remoteUpdated = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        if (remoteUpdated > local.updatedAt) {
          mergedList.push({
            id: remote.id,
            name: remote.name,
            description: remote.description || '',
            coverUrl: remote.cover_url || undefined,
            createdAt: remote.created_at ? new Date(remote.created_at).getTime() : local.createdAt,
            updatedAt: remoteUpdated,
            songs: Array.isArray(remote.songs) ? remote.songs : [],
          });
        } else {
          mergedList.push(local);
          if (local.updatedAt > remoteUpdated) {
            playlistsToPush.push(local);
          }
        }
      } else {
        // Exists locally but not in cloud -> push to cloud
        mergedList.push(local);
        playlistsToPush.push(local);
      }
    }

    // Process remote playlists that don't exist locally
    for (const [remoteId, remote] of remoteMap) {
      if (!localMap.has(remoteId)) {
        mergedList.push({
          id: remote.id,
          name: remote.name,
          description: remote.description || '',
          coverUrl: remote.cover_url || undefined,
          createdAt: remote.created_at ? new Date(remote.created_at).getTime() : Date.now(),
          updatedAt: remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now(),
          songs: Array.isArray(remote.songs) ? remote.songs : [],
        });
      }
    }

    // Sort by updatedAt descending
    mergedList.sort((a, b) => b.updatedAt - a.updatedAt);
    await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(mergedList));

    // Upload pending local playlists to cloud
    if (playlistsToPush.length > 0) {
      const upserts = playlistsToPush.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        description: p.description || '',
        cover_url: p.coverUrl || null,
        songs: p.songs || [],
        created_at: new Date(p.createdAt).toISOString(),
        updated_at: new Date(p.updatedAt).toISOString(),
      }));
      await supabase.from('user_playlists').upsert(upserts, { onConflict: 'id' });
    }

    return mergedList;
  } catch (err) {
    console.warn('[userPlaylistService] Failed to sync playlists with cloud:', err);
    return getUserPlaylists();
  }
}

export async function createPlaylist(
  name: string,
  description?: string,
  coverUrl?: string,
  initialSongs?: Song[],
  explicitUserId?: string | null
): Promise<UserPlaylist> {
  const playlists = await getUserPlaylists();
  const newPlaylist: UserPlaylist = {
    id: `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || 'My Playlist',
    description: description?.trim() || '',
    coverUrl: coverUrl || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songs: initialSongs || [],
  };

  const updated = [newPlaylist, ...playlists];
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));

  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid) {
    try {
      await supabase.from('user_playlists').upsert({
        id: newPlaylist.id,
        user_id: uid,
        name: newPlaylist.name,
        description: newPlaylist.description || '',
        cover_url: newPlaylist.coverUrl || null,
        songs: newPlaylist.songs || [],
        created_at: new Date(newPlaylist.createdAt).toISOString(),
        updated_at: new Date(newPlaylist.updatedAt).toISOString(),
      });
    } catch (err) {
      console.warn('[userPlaylistService] Failed to sync created playlist to Supabase:', err);
    }
  }

  return newPlaylist;
}

export async function addSongToPlaylist(
  playlistId: string,
  song: Song,
  explicitUserId?: string | null
): Promise<{ success: boolean; alreadyExists?: boolean }> {
  const playlists = await getUserPlaylists();
  const targetIndex = playlists.findIndex((p) => p.id === playlistId);
  if (targetIndex === -1) return { success: false };

  const target = playlists[targetIndex];
  const exists = target.songs.some((s) => s.id === song.id);
  if (exists) {
    return { success: false, alreadyExists: true };
  }

  target.songs.push(song);
  target.updatedAt = Date.now();
  if (!target.coverUrl && song.cover) {
    target.coverUrl = song.cover;
  }

  playlists[targetIndex] = { ...target };
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));

  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid) {
    try {
      await supabase
        .from('user_playlists')
        .update({
          cover_url: target.coverUrl || null,
          songs: target.songs,
          updated_at: new Date(target.updatedAt).toISOString(),
        })
        .eq('id', playlistId)
        .eq('user_id', uid);
    } catch (err) {
      console.warn('[userPlaylistService] Failed to update playlist in Supabase:', err);
    }
  }

  return { success: true };
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string,
  explicitUserId?: string | null
): Promise<boolean> {
  const playlists = await getUserPlaylists();
  const targetIndex = playlists.findIndex((p) => p.id === playlistId);
  if (targetIndex === -1) return false;

  const target = playlists[targetIndex];
  target.songs = target.songs.filter((s) => s.id !== songId);
  target.updatedAt = Date.now();

  playlists[targetIndex] = { ...target };
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));

  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid) {
    try {
      await supabase
        .from('user_playlists')
        .update({
          songs: target.songs,
          updated_at: new Date(target.updatedAt).toISOString(),
        })
        .eq('id', playlistId)
        .eq('user_id', uid);
    } catch (err) {
      console.warn('[userPlaylistService] Failed to remove track from Supabase:', err);
    }
  }

  return true;
}

/**
 * Deletes a playlist locally and completely removes it from the Supabase database.
 */
export async function deletePlaylist(
  playlistId: string,
  explicitUserId?: string | null
): Promise<boolean> {
  // 1. Remove from local storage
  const playlists = await getUserPlaylists();
  const updated = playlists.filter((p) => p.id !== playlistId);
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(updated));

  // 2. Remove from Supabase database
  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid) {
    try {
      await supabase
        .from('user_playlists')
        .delete()
        .eq('id', playlistId)
        .eq('user_id', uid);
    } catch (err) {
      console.warn('[userPlaylistService] Error deleting playlist from Supabase:', err);
    }
  }

  return true;
}

export async function renamePlaylist(
  playlistId: string,
  newName: string,
  newDesc?: string,
  explicitUserId?: string | null
): Promise<boolean> {
  const playlists = await getUserPlaylists();
  const targetIndex = playlists.findIndex((p) => p.id === playlistId);
  if (targetIndex === -1) return false;

  playlists[targetIndex].name = newName.trim();
  if (newDesc !== undefined) {
    playlists[targetIndex].description = newDesc.trim();
  }
  playlists[targetIndex].updatedAt = Date.now();
  await SafeStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));

  const uid = await getCurrentUserId(explicitUserId);
  if (isSupabaseConfigured() && uid) {
    try {
      await supabase
        .from('user_playlists')
        .update({
          name: playlists[targetIndex].name,
          description: playlists[targetIndex].description || '',
          updated_at: new Date(playlists[targetIndex].updatedAt).toISOString(),
        })
        .eq('id', playlistId)
        .eq('user_id', uid);
    } catch (err) {
      console.warn('[userPlaylistService] Failed to rename playlist in Supabase:', err);
    }
  }

  return true;
}

// ─── LIKED SONGS FULL METADATA CACHE ───

export async function getStoredLikedSongs(): Promise<Song[]> {
  try {
    const raw = await SafeStorage.getItem(LIKED_SONGS_METADATA_KEY);
    if (!raw) return [];
    const parsed: Song[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveStoredLikedSong(song: Song): Promise<Song[]> {
  const current = await getStoredLikedSongs();
  const filtered = current.filter((s) => s.id !== song.id);
  const updated = [song, ...filtered];
  await SafeStorage.setItem(LIKED_SONGS_METADATA_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeStoredLikedSong(songId: string): Promise<Song[]> {
  const current = await getStoredLikedSongs();
  const updated = current.filter((s) => s.id !== songId);
  await SafeStorage.setItem(LIKED_SONGS_METADATA_KEY, JSON.stringify(updated));
  return updated;
}
