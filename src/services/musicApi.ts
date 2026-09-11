import { Song, Playlist, Artist } from '@/types/music';
import { INITIAL_SONGS, INITIAL_PLAYLISTS, INITIAL_ARTISTS } from './musicCatalog';

export interface SearchResult {
  songs: Song[];
  artists: Artist[];
  playlists: Playlist[];
}

export async function searchMusic(query: string): Promise<SearchResult> {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    return {
      songs: INITIAL_SONGS,
      artists: INITIAL_ARTISTS,
      playlists: INITIAL_PLAYLISTS,
    };
  }

  // Local match scoring
  const songs = INITIAL_SONGS.filter(
    (s) =>
      s.name.toLowerCase().includes(clean) ||
      s.artist.toLowerCase().includes(clean) ||
      s.album.toLowerCase().includes(clean) ||
      (s.language && s.language.toLowerCase().includes(clean))
  );

  const artists = INITIAL_ARTISTS.filter((a) =>
    a.name.toLowerCase().includes(clean)
  );

  const playlists = INITIAL_PLAYLISTS.filter(
    (p) =>
      p.title.toLowerCase().includes(clean) ||
      p.description.toLowerCase().includes(clean)
  );

  return {
    songs,
    artists,
    playlists,
  };
}

export async function getTrendingFeed() {
  return {
    madeForYou: INITIAL_SONGS.slice(0, 4),
    recentlyPlayed: INITIAL_PLAYLISTS.slice(0, 6),
    heavyRotation: INITIAL_SONGS,
    artists: INITIAL_ARTISTS,
    sambalpuriHits: INITIAL_SONGS.filter((s) => s.language === 'Sambalpuri'),
    odiaHits: INITIAL_SONGS.filter((s) => s.language === 'Odia'),
  };
}
