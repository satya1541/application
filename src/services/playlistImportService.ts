import { Song } from '@/types/music';
import { fetchYouTubePlaylist } from './youtubeMusicApi';
import { UserPlaylist, saveUserPlaylists, getUserPlaylists } from './userPlaylistService';
import { cleanTitle, cleanArtist } from './textCleaner';

export type SupportedPlatform = 'youtube' | 'spotify' | 'jiosaavn' | 'unknown';

export interface DetectedPlatformInfo {
  platform: SupportedPlatform;
  platformName: string;
  badgeColor: string;
  iconName: string;
  id: string;
  type: 'playlist' | 'album';
}

export interface PlaylistImportPreview {
  platform: SupportedPlatform;
  platformName: string;
  originalUrl: string;
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  totalTracks: number;
  songs: Song[];
}

/**
 * Detects whether a URL belongs to YouTube, Spotify, or JioSaavn, and extracts identifier.
 */
export function detectPlaylistUrl(rawUrl: string): DetectedPlatformInfo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  // 1. YouTube & YouTube Music Playlists
  // Formats:
  // - https://www.youtube.com/playlist?list=PL...
  // - https://music.youtube.com/playlist?list=PL...
  // - https://youtu.be/watch?v=...&list=PL...
  // - https://www.youtube.com/watch?v=...&list=PL...
  const ytMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/i) || url.match(/youtube\.com\/playlist\/([a-zA-Z0-9_-]+)/i);
  if (ytMatch && ytMatch[1]) {
    const listId = ytMatch[1];
    return {
      platform: 'youtube',
      platformName: 'YouTube Music',
      badgeColor: '#FF0000',
      iconName: 'logo-youtube',
      id: listId,
      type: 'playlist',
    };
  }

  // 2. Spotify Playlists & Albums
  // Formats:
  // - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
  // - https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa
  // - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  const spotifyMatch = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(playlist|album)\/([a-zA-Z0-9]+)/i) ||
    url.match(/spotify:(playlist|album):([a-zA-Z0-9]+)/i);

  if (spotifyMatch && spotifyMatch[2]) {
    const isAlbum = spotifyMatch[1].toLowerCase() === 'album';
    return {
      platform: 'spotify',
      platformName: isAlbum ? 'Spotify Album' : 'Spotify Playlist',
      badgeColor: '#1DB954',
      iconName: 'musical-notes',
      id: spotifyMatch[2],
      type: isAlbum ? 'album' : 'playlist',
    };
  }

  // 3. JioSaavn Playlists & Albums
  // Formats:
  // - https://www.jiosaavn.com/featured/hindi-hit-songs/3tF3dGSmFEs_
  // - https://www.jiosaavn.com/album/.../...
  // - https://www.jiosaavn.com/s/playlist/...
  const saavnMatch = url.match(/jiosaavn\.com\/(featured|album|s\/playlist)\/[^/]+\/([a-zA-Z0-9_-]+)/i);
  if (saavnMatch && saavnMatch[2]) {
    const isAlbum = saavnMatch[1].toLowerCase() === 'album';
    return {
      platform: 'jiosaavn',
      platformName: isAlbum ? 'JioSaavn Album' : 'JioSaavn Playlist',
      badgeColor: '#2BC5B4',
      iconName: 'radio',
      id: saavnMatch[2],
      type: isAlbum ? 'album' : 'playlist',
    };
  }

  return null;
}

/**
 * Fetches preview metadata and songs for a YouTube playlist using YouTube InnerTube.
 */
async function fetchYouTubePlaylistImport(playlistId: string): Promise<PlaylistImportPreview> {
  const browseId = playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId;
  let detectedTitle = 'YouTube Playlist';
  let detectedDesc = '';
  let leadThumb = `https://i.ytimg.com/vi/${playlistId}/hqdefault.jpg`;

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const meta = data.metadata?.playlistMetadataRenderer;
      if (meta?.title) {
        detectedTitle = meta.title;
      }
      if (meta?.description) {
        detectedDesc = meta.description;
      }
      // Check microformat for fallback title
      if (!meta?.title && data.microformat?.microformatDataRenderer?.title) {
        detectedTitle = data.microformat.microformatDataRenderer.title;
      }
    }
  } catch (err) {
    console.warn('[playlistImportService] Error fetching YouTube playlist metadata:', err);
  }

  // Fetch full songs using InnerTube song parser
  const songs = (await fetchYouTubePlaylist(playlistId, detectedTitle, 100)) as unknown as Song[];

  if (songs.length > 0 && songs[0].cover) {
    leadThumb = songs[0].cover;
  }

  return {
    platform: 'youtube',
    platformName: 'YouTube Music',
    originalUrl: `https://music.youtube.com/playlist?list=${playlistId}`,
    id: playlistId,
    title: detectedTitle,
    description: detectedDesc || `Imported from YouTube Music (${songs.length} tracks)`,
    coverUrl: leadThumb,
    totalTracks: songs.length,
    songs,
  };
}

/**
 * Fetches preview metadata and songs for a Spotify playlist/album via public embed JSON.
 */
async function fetchSpotifyPlaylistImport(
  id: string,
  type: 'playlist' | 'album' = 'playlist'
): Promise<PlaylistImportPreview> {
  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;

  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load Spotify ${type} (HTTP ${res.status})`);
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

  if (!match || !match[1]) {
    throw new Error('Could not parse Spotify playlist details. The playlist may be private.');
  }

  const parsed = JSON.parse(match[1]);
  const entity = parsed?.props?.pageProps?.state?.data?.entity;

  if (!entity) {
    throw new Error('Spotify playlist data not found. Please verify the link is public.');
  }

  const title = entity.name || entity.title || 'Spotify Playlist';
  const description = entity.subtitle || (entity.authors && entity.authors[0]?.name ? `By ${entity.authors[0].name}` : '');
  const coverUrl = entity.coverArt?.sources?.[0]?.url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800';

  const rawTrackList = entity.trackList || [];
  const tracksToResolve: {
    trackId: string;
    cleanName: string;
    cleanArt: string;
    durationSeconds: number;
  }[] = [];

  for (let i = 0; i < rawTrackList.length; i++) {
    const item = rawTrackList[i];
    const trackTitle = item.title || item.name || '';
    const trackArtist = item.subtitle || item.artists?.map((a: { name: string }) => a.name).join(', ') || 'Unknown Artist';
    const durationSeconds = item.duration ? Math.round(item.duration / 1000) : 210;
    const trackId = item.uri ? item.uri.replace('spotify:track:', '') : (item.uid || `${id}_${i}`);

    if (trackTitle) {
      tracksToResolve.push({
        trackId,
        cleanName: cleanTitle(trackTitle),
        cleanArt: cleanArtist(trackArtist),
        durationSeconds,
      });
    }
  }

  // Resolve individual song covers in parallel (Pool of 8 workers)
  const resolvedCovers: string[] = new Array(tracksToResolve.length).fill(coverUrl);
  const concurrency = 8;
  let poolIdx = 0;

  async function resolveWorker() {
    while (poolIdx < tracksToResolve.length) {
      const idx = poolIdx++;
      const { trackId, cleanName, cleanArt } = tracksToResolve[idx];

      // 1. Try official Spotify oembed first
      if (trackId && !trackId.includes('_')) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`, {
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (r.ok) {
            const j = await r.json();
            if (j.thumbnail_url) {
              resolvedCovers[idx] = j.thumbnail_url;
              continue;
            }
          }
        } catch {}
      }

      // 2. Fallback to iTunes 600x600 artwork
      if (cleanName) {
        try {
          const query = `${cleanName} ${cleanArt}`.trim();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          const r = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`,
            { signal: controller.signal }
          );
          clearTimeout(timeout);
          if (r.ok) {
            const j = await r.json();
            const art = j.results?.[0]?.artworkUrl100;
            if (art) {
              resolvedCovers[idx] = art.replace('100x100bb', '600x600bb');
              continue;
            }
          }
        } catch {}
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => resolveWorker());
  await Promise.all(workers);

  const songs: Song[] = tracksToResolve.map((t, idx) => ({
    id: `sp_${t.trackId}`,
    name: t.cleanName,
    artist: t.cleanArt,
    album: title,
    duration: t.durationSeconds,
    cover: resolvedCovers[idx] || coverUrl,
    streamUrl: '', // Automatically resolved via audioStreamResolver on play
    quality: '320kbps',
    source: 'jiosaavn',
    hasLyrics: false,
  }));

  return {
    platform: 'spotify',
    platformName: type === 'album' ? 'Spotify Album' : 'Spotify Playlist',
    originalUrl: `https://open.spotify.com/${type}/${id}`,
    id,
    title,
    description: description || `Imported from Spotify (${songs.length} tracks)`,
    coverUrl,
    totalTracks: songs.length,
    songs,
  };
}

/**
 * Automatically inspects existing user playlists and fixes any tracks where
 * the song cover was defaulted to the playlist cover.
 */
export async function autoFixImportedPlaylistCovers(): Promise<boolean> {
  try {
    const playlists = await getUserPlaylists();
    let anyModified = false;

    for (const pl of playlists) {
      if (!pl.songs || pl.songs.length === 0) continue;

      // Identify songs that have identical cover to playlist or need resolution
      const targetIndices: number[] = [];
      for (let idx = 0; idx < pl.songs.length; idx++) {
        const s = pl.songs[idx];
        if (
          (pl.coverUrl && s.cover === pl.coverUrl) ||
          s.cover.includes('images.unsplash.com') ||
          (s.id.startsWith('sp_') && !s.cover.includes('spotifycdn.com') && !s.cover.includes('mzstatic.com'))
        ) {
          targetIndices.push(idx);
        }
      }

      if (targetIndices.length === 0) continue;

      let changedInThisPlaylist = false;
      const updatedSongs = [...pl.songs];
      const concurrency = 6;
      let targetIdx = 0;

      async function worker() {
        while (targetIdx < targetIndices.length) {
          const songIdx = targetIndices[targetIdx++];
          const song = updatedSongs[songIdx];
          let foundCover: string | null = null;

          // 1. Check if ID contains spotify track ID (22 chars)
          const cleanId = song.id.replace(/^sp_/, '');
          if (/^[a-zA-Z0-9]{22}$/.test(cleanId)) {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 2500);
              const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${cleanId}`, {
                signal: controller.signal,
              });
              clearTimeout(timeout);
              if (r.ok) {
                const j = await r.json();
                if (j.thumbnail_url) foundCover = j.thumbnail_url;
              }
            } catch {}
          }

          // 2. Try iTunes search by title + artist
          if (!foundCover && song.name) {
            try {
              const query = `${song.name} ${song.artist || ''}`.trim();
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 2500);
              const r = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`,
                { signal: controller.signal }
              );
              clearTimeout(timeout);
              if (r.ok) {
                const j = await r.json();
                const art = j.results?.[0]?.artworkUrl100;
                if (art) foundCover = art.replace('100x100bb', '600x600bb');
              }
            } catch {}
          }

          if (foundCover && foundCover !== song.cover) {
            updatedSongs[songIdx] = { ...song, cover: foundCover };
            changedInThisPlaylist = true;
          }
        }
      }

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      if (changedInThisPlaylist) {
        pl.songs = updatedSongs;
        anyModified = true;
      }
    }

    if (anyModified) {
      await saveUserPlaylists(playlists);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[playlistImportService] Error auto-fixing playlist covers:', err);
    return false;
  }
}

/**
 * Fetches preview for any supported playlist link.
 */
export async function fetchPlaylistPreview(rawUrl: string): Promise<PlaylistImportPreview> {
  const detected = detectPlaylistUrl(rawUrl);
  if (!detected) {
    throw new Error('Invalid or unsupported URL. Please provide a valid YouTube or Spotify playlist link.');
  }

  if (detected.platform === 'youtube') {
    return fetchYouTubePlaylistImport(detected.id);
  }

  if (detected.platform === 'spotify') {
    return fetchSpotifyPlaylistImport(detected.id, detected.type);
  }

  throw new Error('Unsupported platform format.');
}

/**
 * Completes the import and creates a new UserPlaylist stored locally and in Supabase.
 */
export async function importPlaylistToLibrary(
  preview: PlaylistImportPreview,
  customTitle?: string
): Promise<UserPlaylist> {
  const playlists = await getUserPlaylists();
  const playlistName = (customTitle || preview.title).trim() || 'Imported Playlist';

  const newPlaylist: UserPlaylist = {
    id: `pl_imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: playlistName,
    description: preview.description,
    coverUrl: preview.coverUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    songs: preview.songs,
  };

  const updated = [newPlaylist, ...playlists];
  await saveUserPlaylists(updated);
  return newPlaylist;
}
