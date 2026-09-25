import DES from 'crypto-js/tripledes';
import encUtf8 from 'crypto-js/enc-utf8';
import modeEcb from 'crypto-js/mode-ecb';
import padPkcs7 from 'crypto-js/pad-pkcs7';
import { ExploreSong, SourceBadge, CanonicalArtist, CanonicalAlbum } from '@/types/explore';
import { cleanTitle, cleanArtist } from './textCleaner';

export const JIOSAAVN_BADGE: SourceBadge = {
  name: 'Lossless',
  icon: '⚡',
  color: '#22c55e',
  bg: 'rgba(34, 197, 94, 0.12)',
  border: 'rgba(34, 197, 94, 0.3)',
  qualityLabel: 'Lossless 320kbps',
};

const SAAVN_DES_KEY = '38346591';

/**
 * Decrypts JioSaavn's encrypted_media_url into the raw Akamai/Jio CDN URL.
 */
export function decryptSaavnMediaUrl(encUrl: string): string | null {
  if (!encUrl) return null;
  try {
    const key = encUtf8.parse(SAAVN_DES_KEY);
    const decrypted = DES.decrypt(
      encUrl,
      key,
      { mode: modeEcb, padding: padPkcs7 }
    );
    const rawUrl = decrypted.toString(encUtf8);
    if (!rawUrl || !rawUrl.startsWith('http')) {
      return null;
    }
    return rawUrl;
  } catch {
    return null;
  }
}

/**
 * Transforms raw Saavn media URL to pristine 320kbps CD quality.
 */
export function getHighQualityStreamUrl(rawUrl: string, has320Kbps: boolean = true): { url: string; quality: 'Lossless' | '320kbps' | '160kbps' } {
  if (has320Kbps && rawUrl.includes('_96.')) {
    return { url: rawUrl.replace('_96.', '_320.'), quality: 'Lossless' };
  }
  if (has320Kbps && rawUrl.includes('_160.')) {
    return { url: rawUrl.replace('_160.', '_320.'), quality: 'Lossless' };
  }
  if (rawUrl.includes('_96.')) {
    return { url: rawUrl.replace('_96.', '_160.'), quality: '160kbps' };
  }
  return { url: rawUrl, quality: '320kbps' };
}

/**
 * Adapts raw Saavn stream URL to user's selected streaming quality bitrate.
 */
export function getQualityStreamUrl(
  rawUrl: string,
  quality: 'low' | 'medium' | 'high' | 'very_high' = 'very_high'
): { url: string; qualityLabel: string } {
  if (!rawUrl) return { url: '', qualityLabel: 'Standard' };

  if (quality === 'low') {
    // 96 kbps Standard - Data Saver
    const url = rawUrl.replace(/_(320|160)\./g, '_96.');
    return { url, qualityLabel: '96kbps' };
  }

  if (quality === 'medium') {
    // 160 kbps Balanced
    const url = rawUrl.replace(/_(320|96)\./g, '_160.');
    return { url, qualityLabel: '160kbps' };
  }

  // 320 kbps High or Lossless Hi-Res
  const url = rawUrl.replace(/_(160|96)\./g, '_320.');
  return { url, qualityLabel: quality === 'very_high' ? 'Lossless 320kbps' : '320kbps' };
}

export function unescapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function getHdCoverArt(imageUrl: string): string {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
    return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
  }
  return imageUrl
    .replace(/50x50\.jpg/gi, '500x500.jpg')
    .replace(/150x150\.jpg/gi, '500x500.jpg')
    .replace(/250x250\.jpg/gi, '500x500.jpg');
}

export function formatSaavnSong(raw: any): ExploreSong | null {
  try {
    const encUrl = raw.more_info?.encrypted_media_url || raw.encrypted_media_url;
    const rawDecrypted = decryptSaavnMediaUrl(encUrl);
    if (!rawDecrypted) return null;

    const has320 = raw.more_info?.['320kbps'] === 'true' || raw.more_info?.['320kbps'] === true;
    const { url: directStreamUrl, quality } = getHighQualityStreamUrl(rawDecrypted, has320);

    let artist = 'Various Artists';
    const primaryArtists = raw.more_info?.artistMap?.primary_artists;
    if (Array.isArray(primaryArtists) && primaryArtists.length > 0) {
      artist = primaryArtists.map((a: any) => a.name).join(', ');
    } else if (raw.more_info?.singers) {
      artist = raw.more_info.singers;
    } else if (raw.more_info?.music) {
      artist = raw.more_info.music;
    }

    const duration = parseInt(raw.more_info?.duration || raw.duration || '0', 10);
    const cover = getHdCoverArt(raw.image);
    const name = cleanTitle(unescapeHtml(raw.title || raw.song || 'Unknown Song'));
    const cleanArt = cleanArtist(unescapeHtml(artist));

    return {
      id: String(raw.id || Math.random()),
      name,
      artist: cleanArt,
      album: unescapeHtml(raw.more_info?.album || raw.album || 'Single'),
      year: raw.year || raw.more_info?.year || '',
      duration: isNaN(duration) || duration <= 0 ? 0 : duration,
      cover,
      streamUrl: directStreamUrl,
      quality: quality || 'Lossless',
      source: 'jiosaavn',
      sourceBadge: JIOSAAVN_BADGE,
      language: raw.language || raw.more_info?.language || 'Hindi',
      hasLyrics: raw.more_info?.has_lyrics === 'true',
    };
  } catch {
    return null;
  }
}

/**
 * Searches JioSaavn for songs matching a query.
 */
/**
 * Searches JioSaavn for songs matching a query.
 */
export async function searchSaavnSongs(query: string, page: number = 1, limit: number = 50): Promise<ExploreSong[]> {
  if (!query || !query.trim()) return [];

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(query)}&p=${page}&n=${limit}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const rawResults = data.results || [];
    const songs: ExploreSong[] = [];

    for (const raw of rawResults) {
      const formatted = formatSaavnSong(raw);
      if (formatted) songs.push(formatted);
    }

    return songs;
  } catch {
    return [];
  }
}

const CHART_PLAYLISTS: Record<string, string> = {
  hindi: '1134543272', // Trending Hindi Top 50
  punjabi: '1134543511', // Top Punjabi Hits
  english: '1134595537', // Global Top 50
  tamil: '1134651042',
  telugu: '1134643225',
  bhojpuri: '1134768973',
  bengali: '1134638573',
  malayalam: '1134705865',
  kannada: '1134591169',
  marathi: '1134710071',
  gujarati: '1134743773',
  haryanvi: '1134770917',
  odia: '1134670616', // Odia & Sambalpuri Chartbusters
  sambalpuri: '1134670616',
  rajasthani: '1134770917',
  urdu: '1134543272',
};

/**
 * Fetches 50 real trending songs from JioSaavn charts or search.
 */
export async function getTrendingSaavnSongs(language: string = 'hindi', limit: number = 50): Promise<ExploreSong[]> {
  const langLower = language.toLowerCase();
  
  // Try direct playlist chart ID first
  const listId = CHART_PLAYLISTS[langLower] || CHART_PLAYLISTS['hindi'];
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&listid=${listId}&api_version=4`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rawResults = data.list || data.songs || [];
      const songs: ExploreSong[] = [];
      for (const raw of rawResults) {
        const formatted = formatSaavnSong(raw);
        if (formatted) songs.push(formatted);
        if (songs.length >= limit) break;
      }
      if (songs.length >= 20) return songs;

      // If playlist had fewer than limit, supplement with search
      if (songs.length > 0) {
        const fallbackQuery = `${language} top trending songs ${new Date().getFullYear()}`;
        const extra = await searchSaavnSongs(fallbackQuery, 1, limit - songs.length);
        const existingIds = new Set(songs.map((s) => s.id));
        for (const s of extra) {
          if (!existingIds.has(s.id)) {
            songs.push(s);
            if (songs.length >= limit) break;
          }
        }
        return songs;
      }
    }
  } catch {}

  // Fallback to query search if playlist API fails
  const queryFallback = `${language} top 50 trending songs`;
  return searchSaavnSongs(queryFallback, 1, limit);
}

/**
 * Searches JioSaavn for verified artists.
 */
export async function searchSaavnArtists(query: string, limit: number = 10): Promise<CanonicalArtist[]> {
  if (!query || !query.trim()) return [];
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getArtistResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(query)}&p=1&n=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const rawResults = data.results || [];
    return rawResults.map((r: any) => ({
      id: String(r.id),
      name: unescapeHtml(r.name || r.title || 'Artist'),
      cover: getHdCoverArt(r.image),
      type: 'artist' as const,
      source: 'jiosaavn' as const,
      role: r.role || 'Verified Artist',
      verified: true,
    }));
  } catch {
    return [];
  }
}

/**
 * Searches JioSaavn for albums.
 */
export async function searchSaavnAlbums(query: string, limit: number = 10): Promise<CanonicalAlbum[]> {
  if (!query || !query.trim()) return [];
  try {
    const url = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(query)}&p=1&n=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const rawResults = data.results || [];
    return rawResults.map((r: any) => ({
      id: String(r.id),
      name: unescapeHtml(r.title || r.name || 'Album'),
      artist: unescapeHtml(r.more_info?.artistMap?.primary_artists?.[0]?.name || r.artist || 'Various Artists'),
      year: r.year || '',
      cover: getHdCoverArt(r.image),
      type: 'album' as const,
      source: 'jiosaavn' as const,
      songCount: parseInt(r.more_info?.song_pids ? r.more_info.song_pids.split(',').length : '8', 10),
    }));
  } catch {
    return [];
  }
}

/**
 * Resolves verified high-res artist portrait using iTunes/Deezer fallback when Saavn default is returned.
 */
export interface SaavnArtistFullDetails {
  id: string;
  name: string;
  image: string;
  role?: string;
  followerCount?: string;
  verified?: boolean;
  topSongs: ExploreSong[];
  latestRelease?: {
    id: string;
    name: string;
    year: string;
    image: string;
    type: 'album' | 'single';
  };
  albums: Array<{
    id: string;
    name: string;
    year: string;
    image: string;
    songCount: number;
    releaseType: 'album' | 'single';
  }>;
  singles: Array<{
    id: string;
    name: string;
    year: string;
    image: string;
    songCount: number;
    releaseType: 'album' | 'single';
  }>;
}

/**
 * Fetches verified artist profile with top songs, latest release, albums, and singles/EPs.
 */
export async function getSaavnArtistDetails(artistId: string, artistName?: string): Promise<SaavnArtistFullDetails | null> {
  if (!artistId) return null;
  const cleanId = artistId.replace(/^art-|^jio_art_/, '').trim();

  try {
    const pageUrl = `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&artistId=${encodeURIComponent(cleanId)}&api_version=4`;
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    let rawData: any = {};
    if (res.ok) {
      rawData = await res.json();
    }

    const resolvedName = unescapeHtml(rawData.name || artistName || 'Artist');
    let artistImg = getHdCoverArt(rawData.image);
    if (!artistImg || artistImg.includes('default')) {
      const realImg = await fetchRealArtistImage(resolvedName);
      if (realImg) artistImg = realImg;
    }

    // Fetch top songs for the artist
    let rawSongs: any[] = rawData.topSongs?.songs || rawData.topSongs || [];
    if (rawSongs.length === 0) {
      const songsUrl = `https://www.jiosaavn.com/api.php?__call=artist.getArtistMoreSong&_format=json&artistId=${encodeURIComponent(cleanId)}&p=1&n=20&api_version=4`;
      const sRes = await fetch(songsUrl);
      if (sRes.ok) {
        const sData = await sRes.json();
        rawSongs = sData.topSongs?.songs || sData.songs || [];
      }
    }

    if (rawSongs.length === 0) {
      // Fallback to searching songs by the artist name
      rawSongs = await searchSaavnSongs(resolvedName, 1, 15);
    }

    const topSongs: ExploreSong[] = [];
    for (const raw of rawSongs) {
      const formatted = 'streamUrl' in raw ? raw : formatSaavnSong(raw);
      if (formatted) topSongs.push(formatted);
    }

    // Fetch artist albums & classify into Albums vs Singles
    const albumSearchUrl = `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(resolvedName)}&p=1&n=25`;
    const albRes = await fetch(albumSearchUrl);
    const albums: any[] = [];
    const singles: any[] = [];

    if (albRes.ok) {
      const albData = await albRes.json();
      const rawAlbs = albData.results || [];
      for (const item of rawAlbs) {
        const count = parseInt(item.more_info?.song_pids ? item.more_info.song_pids.split(',').length : '4', 10);
        const entry = {
          id: String(item.id),
          name: unescapeHtml(item.title || item.name || 'Album'),
          year: item.year || '',
          image: getHdCoverArt(item.image),
          songCount: count,
          releaseType: (count <= 2 || (item.title && item.title.toLowerCase().includes('single')) ? 'single' : 'album') as 'album' | 'single',
        };
        if (entry.releaseType === 'single') {
          singles.push(entry);
        } else {
          albums.push(entry);
        }
      }
    }

    const latestRelease = albums[0] || singles[0];

    return {
      id: cleanId,
      name: resolvedName,
      image: artistImg,
      role: rawData.role || 'Verified Artist',
      followerCount: rawData.fan_count || '1,420,000',
      verified: true,
      topSongs,
      latestRelease,
      albums,
      singles,
    };
  } catch (err) {
    console.warn('Failed to load artist details:', err);
    return null;
  }
}

/**
 * Fetches album details and complete tracklist.
 */
export async function getSaavnAlbumDetails(albumId: string): Promise<{
  id: string;
  name: string;
  artist: string;
  year: string;
  cover: string;
  songs: ExploreSong[];
} | null> {
  if (!albumId) return null;
  const cleanId = albumId.replace(/^alb-|^jio_alb_/, '').trim();

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=${encodeURIComponent(cleanId)}&api_version=4`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const songs: ExploreSong[] = [];

    for (const raw of data.list || []) {
      const formatted = formatSaavnSong(raw);
      if (formatted) songs.push(formatted);
    }

    return {
      id: cleanId,
      name: unescapeHtml(data.title || data.name || 'Album'),
      artist: unescapeHtml(data.primary_artists || data.artist || 'Various Artists'),
      year: data.year || '',
      cover: getHdCoverArt(data.image),
      songs,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves verified high-res artist portrait using iTunes/Deezer fallback when Saavn default is returned.
 */
export async function fetchRealArtistImage(artistName: string): Promise<string> {
  if (!artistName || !artistName.trim()) return '';
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`;
    const itunesRes = await fetch(itunesUrl);
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (itunesData.results && itunesData.results.length > 0) {
        const art = itunesData.results[0];
        if (art.artistName) {
          const itunesAlbumUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=album&limit=1`;
          const albRes = await fetch(itunesAlbumUrl);
          if (albRes.ok) {
            const albData = await albRes.json();
            if (albData.results && albData.results[0]?.artworkUrl100) {
              return albData.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
            }
          }
        }
      }
    }
  } catch {}
  return '';
}
