import { Song } from '@/types/music';
import { YOUTUBE_OPUS_BADGE } from './youtubeMusicApi';
import { SafeStorage } from './storage';

export interface ExploreSong {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: string;
  views?: string;
  album?: string;
}

export interface ExploreAlbum {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  type: string; // 'Album' | 'EP' | 'Single'
}

export interface ExploreVideo {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  views?: string;
  duration?: string;
}

export interface MoodOrGenre {
  text: string;
  color: string;
  params: string;
  browseId: string;
  icon?: string;
}

export interface CategoryShelfItem {
  id: string;
  videoId?: string;
  title: string;
  subtitle: string;
  album?: string;
  thumbnail: string;
  isPlaylist?: boolean;
  isVideo?: boolean;
  isSong?: boolean;
}

export interface CategoryShelf {
  title: string;
  isSongsShelf?: boolean;
  items: CategoryShelfItem[];
}

export interface CategoryDetailResult {
  title: string;
  shelves: CategoryShelf[];
}

export interface ExplorePlaylistTrack {
  id: string; // 'yt_' + videoId
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  thumbnail: string;
}

export interface ExplorePlaylistDetail {
  id: string;
  title: string;
  subtitle: string;
  secondSubtitle: string;
  description: string;
  thumbnail: string;
  trackCount: number;
  tracks: ExplorePlaylistTrack[];
}

export interface ExploreOverviewResult {
  trendingSongs: ExploreSong[];
  newAlbums: ExploreAlbum[];
  newMusicVideos: ExploreVideo[];
  moods: MoodOrGenre[];
  genres: MoodOrGenre[];
  timestamp: number;
}

const CACHE_KEY_EXPLORE = '@shorty_yt_explore_overview_v1';
const CACHE_KEY_MOODS_GENRES = '@shorty_yt_moods_genres_v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function normalizeExploreUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) {
    return 'https:' + trimmed;
  }
  return trimmed;
}

/**
 * Built-in static seed for Moods & Moments (exact YouTube Music official color palette)
 */
export const OFFICIAL_MOODS: MoodOrGenre[] = [
  { text: 'Chill', color: '#ffa4c5', params: 'ggMPOg1uX1JOQWZFeDByc2Jm', browseId: 'FEmusic_moods_and_genres_category', icon: 'cafe-outline' },
  { text: 'Commute', color: '#69db7c', params: 'ggMPOg1uX044Z2o5WERLckpU', browseId: 'FEmusic_moods_and_genres_category', icon: 'car-outline' },
  { text: 'Energize', color: '#f4c344', params: 'ggMPOg1uX2lRZUZiMnNrQnJW', browseId: 'FEmusic_moods_and_genres_category', icon: 'flash-outline' },
  { text: 'Feel good', color: '#ffab40', params: 'ggMPOg1uXzZQbDB5eThLRTQ3', browseId: 'FEmusic_moods_and_genres_category', icon: 'sunny-outline' },
  { text: 'Focus', color: '#7fd3ed', params: 'ggMPOg1uX0NvNGNhWThMYWRh', browseId: 'FEmusic_moods_and_genres_category', icon: 'headset-outline' },
  { text: 'Gaming', color: '#845ef7', params: 'ggMPOg1uX3NmUVV4Vzl3WGQ0', browseId: 'FEmusic_moods_and_genres_category', icon: 'game-controller-outline' },
  { text: 'Party', color: '#b47bff', params: 'ggMPOg1uX0pmQ0s2V0JRclZs', browseId: 'FEmusic_moods_and_genres_category', icon: 'sparkles-outline' },
  { text: 'Romance', color: '#ff637e', params: 'ggMPOg1uX0FzQ2FhZWtUY211', browseId: 'FEmusic_moods_and_genres_category', icon: 'heart-outline' },
  { text: 'Sad', color: '#90a4ae', params: 'ggMPOg1uX0JLQ0gySWZKZVY1', browseId: 'FEmusic_moods_and_genres_category', icon: 'rainy-outline' },
  { text: 'Sleep', color: '#4dabf7', params: 'ggMPOg1uX1MxaFQ3Z0JMZkN4', browseId: 'FEmusic_moods_and_genres_category', icon: 'moon-outline' },
  { text: 'Workout', color: '#ff8d40', params: 'ggMPOg1uX09LWkhnTjRGRUJh', browseId: 'FEmusic_moods_and_genres_category', icon: 'barbell-outline' },
];

/**
 * Built-in static seed for Genres (Indian Regional & Global)
 */
export const OFFICIAL_GENRES: MoodOrGenre[] = [
  { text: 'Hindi', color: '#ffffe7', params: 'ggMPOg1uX2ZvbzNJMzJwRkFT', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Punjabi', color: '#ffe24b', params: 'ggMPOg1uX1ZKNkRodjF2YWxv', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Bhojpuri', color: '#aa09aa', params: 'ggMPOg1uX05iYWtoenBuUkZX', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Tamil', color: '#cc0000', params: 'ggMPOg1uX2p2emtjU3J3ZVFB', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Telugu', color: '#ffff78', params: 'ggMPOg1uX0syaEVmTXhSOVl6', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Bengali', color: '#ffffe7', params: 'ggMPOg1uX1ZEZzBvYUp0TGNI', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Pop', color: '#ffff78', params: 'ggMPOg1uX1lLQkxHbHhWQUUy', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Hip-hop', color: '#ffe24b', params: 'ggMPOg1uX0M2dmRieXNxTW1s', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Rock', color: '#cc0000', params: 'ggMPOg1uXzJKTm5jUEZ5Uzlu', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Dance & electronic', color: '#0092bf', params: 'ggMPOg1uX1NPTld3SDN3WGs4', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Desi hip-hop', color: '#606060', params: 'ggMPOg1uX3VtYUhGSmtKdlhr', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Indian pop', color: '#ffa4ff', params: 'ggMPOg1uXzNleFNpSmk2TTcy', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Indian indie', color: '#cccccc', params: 'ggMPOg1uX3FzMXBrNWlUMWNH', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Malayalam', color: '#00a513', params: 'ggMPOg1uX050dDRiSWN3R1ZN', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Kannada', color: '#ffffc2', params: 'ggMPOg1uX29zOEp0MzY3djA5', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Haryanvi', color: '#0092bf', params: 'ggMPOg1uXzVTb3lITFZwQ2w1', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Ghazal/sufi', color: '#4deeff', params: 'ggMPOg1uX1FyMnBXRmhFakpn', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Devotional', color: '#606060', params: 'ggMPOg1uX3g1dEo4cmZVY1Jm', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'R&B & soul', color: '#7b3edb', params: 'ggMPOg1uX2JxQ2hxc2J5UFhR', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'K-Pop', color: '#b47bff', params: 'ggMPOg1uX0JrbjBDOFFPSzJW', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'J-Pop', color: '#ffff78', params: 'ggMPOg1uXzAwSjVITDBZckJR', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Latin', color: '#ffffc2', params: 'ggMPOg1uX29wWTRjMHV1dWN5', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Folk & acoustic', color: '#00a513', params: 'ggMPOg1uXzBTRFBmQ3N4b0R6', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Classical', color: '#cccccc', params: 'ggMPOg1uX1N4VmduTmdUR3dm', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Hindustani classical', color: '#ffff78', params: 'ggMPOg1uX1FEVXVJSkdrdVgw', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Carnatic classical', color: '#ff8d40', params: 'ggMPOg1uX2tuQ3JyczRkeEJK', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Indie & alternative', color: '#cccccc', params: 'ggMPOg1uX21NWWpBbU01SDgy', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Metal', color: '#8c8c8c', params: 'ggMPOg1uXzdlSXhKZ0hMV1Z4', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Decades', color: '#ffa4ff', params: 'ggMPOg1uX253QXk4VXN5NGdj', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Monsoon', color: '#ffffe7', params: 'ggMPOg1uX2FGWmM5SHVqYlJX', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'African', color: '#f76707', params: 'ggMPOg1uX0UzWGxlRE5jMDVk', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Arabic', color: '#ff922b', params: 'ggMPOg1uX3VOQWxsblVZTFNE', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Country & Americana', color: '#fab005', params: 'ggMPOg1uX1RXcFlyZEpRb1d3', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Family', color: '#38d9a9', params: 'ggMPOg1uXzMyY3J2SGM0bVh5', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Gujarati', color: '#ffa94d', params: 'ggMPOg1uX0RXaUs0U3dTcWtD', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Marathi', color: '#ffd43b', params: 'ggMPOg1uX2Y4V2dyOWVRUHZm', browseId: 'FEmusic_moods_and_genres_category' },
  { text: 'Reggae & caribbean', color: '#51cf66', params: 'ggMPOg1uX1JUc2lFcDFuUUth', browseId: 'FEmusic_moods_and_genres_category' },
];

let inMemoryExploreCache: ExploreOverviewResult | null = null;

/**
 * Converts an ExploreSong item directly to Shorty's Song interface for immediate playback
 */
export function exploreSongToSong(item: ExploreSong): Song {
  return {
    id: item.id.startsWith('yt_') ? item.id : `yt_${item.videoId}`,
    name: item.title,
    artist: item.artist,
    album: item.album || 'YouTube Music Trending',
    duration: 210,
    cover: item.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    streamUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
    quality: 'Opus',
    source: 'youtube',
    sourceBadge: YOUTUBE_OPUS_BADGE,
    hasLyrics: false,
  };
}

/**
 * Fetches the complete Explore Overview from YouTube Music InnerTube API (browseId: 'FEmusic_explore')
 */
export async function fetchExploreOverview(forceRefresh = false): Promise<ExploreOverviewResult> {
  if (!forceRefresh && inMemoryExploreCache && Date.now() - inMemoryExploreCache.timestamp < CACHE_TTL_MS) {
    return inMemoryExploreCache;
  }

  // Check persistent disk cache
  if (!forceRefresh) {
    try {
      const raw = await SafeStorage.getItem(CACHE_KEY_EXPLORE);
      if (raw) {
        const parsed = JSON.parse(raw) as ExploreOverviewResult;
        if (parsed && parsed.trendingSongs?.length > 0) {
          inMemoryExploreCache = parsed;
          return parsed;
        }
      }
    } catch {}
  }

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240105.01.00',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/explore',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240105.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId: 'FEmusic_explore',
      }),
    });

    if (!res.ok) {
      throw new Error(`InnerTube explore failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    const sectionList =
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents || [];

    const trendingSongs: ExploreSong[] = [];
    const newAlbums: ExploreAlbum[] = [];
    const newMusicVideos: ExploreVideo[] = [];

    for (const sec of sectionList) {
      const carousel = sec.musicCarouselShelfRenderer;
      if (!carousel) continue;

      const title =
        carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map((r: any) => r.text).join('') || '';
      const items = carousel.contents || [];

      if (title.toLowerCase().includes('trending') || title.toLowerCase().includes('songs')) {
        for (const it of items) {
          const resp = it.musicResponsiveListItemRenderer;
          if (!resp) continue;
          const flexCols = resp.flexColumns || [];
          const songTitle =
            flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
          const artistText =
            flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
          const videoId =
            resp.playlistItemData?.videoId ||
            resp.navigationEndpoint?.watchEndpoint?.videoId ||
            resp.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
              ?.watchEndpoint?.videoId ||
            '';
          const thumb =
            resp.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          if (songTitle && videoId) {
            trendingSongs.push({
              id: `yt_${videoId}`,
              videoId,
              title: songTitle,
              artist: artistText,
              thumbnail: normalizeExploreUrl(thumb),
            });
          }
        }
      } else if (title.toLowerCase().includes('albums') || title.toLowerCase().includes('singles')) {
        for (const it of items) {
          const twoRow = it.musicTwoRowItemRenderer;
          if (!twoRow) continue;
          const albumTitle = twoRow.title?.runs?.map((r: any) => r.text).join('') || '';
          const subtitle = twoRow.subtitle?.runs?.map((r: any) => r.text).join('') || '';
          const browseId = twoRow.navigationEndpoint?.browseEndpoint?.browseId || '';
          const thumb = twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const isEp = subtitle.toLowerCase().includes('ep');
          const isSingle = subtitle.toLowerCase().includes('single');
          const albumType = isEp ? 'EP' : isSingle ? 'Single' : 'Album';

          if (albumTitle && browseId) {
            newAlbums.push({
              id: browseId,
              title: albumTitle,
              artist: subtitle.split('•').pop()?.trim() || subtitle,
              thumbnail: normalizeExploreUrl(thumb),
              type: albumType,
            });
          }
        }
      } else if (title.toLowerCase().includes('music videos')) {
        for (const it of items) {
          const twoRow = it.musicTwoRowItemRenderer;
          if (!twoRow) continue;
          const videoTitle = twoRow.title?.runs?.map((r: any) => r.text).join('') || '';
          const subtitle = twoRow.subtitle?.runs?.map((r: any) => r.text).join('') || '';
          const videoId = twoRow.navigationEndpoint?.watchEndpoint?.videoId || '';
          const thumb =
            twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          if (videoTitle && videoId) {
            newMusicVideos.push({
              videoId,
              title: videoTitle,
              artist: subtitle.split('•')[0]?.trim() || subtitle,
              views: subtitle.split('•')[1]?.trim() || '',
              thumbnail: normalizeExploreUrl(thumb),
            });
          }
        }
      }
    }

    const result: ExploreOverviewResult = {
      trendingSongs,
      newAlbums,
      newMusicVideos,
      moods: OFFICIAL_MOODS,
      genres: OFFICIAL_GENRES,
      timestamp: Date.now(),
    };

    inMemoryExploreCache = result;
    SafeStorage.setItem(CACHE_KEY_EXPLORE, JSON.stringify(result)).catch(() => {});
    return result;
  } catch (err) {
    console.warn('[youtubeExploreService] Failed to fetch explore overview:', err);
    return getExploreFallback();
  }
}

/**
 * Returns fallback explore data to guarantee instant rendering
 */
export async function getExploreFallback(): Promise<ExploreOverviewResult> {
  try {
    const raw = await SafeStorage.getItem(CACHE_KEY_EXPLORE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.trendingSongs?.length > 0) return parsed;
    }
  } catch {}

  return {
    trendingSongs: [
      {
        id: 'yt_yWNPxS0sXnE',
        videoId: 'yWNPxS0sXnE',
        title: 'Jai Jai Ram',
        artist: 'Shreya Ghoshal & Arijit Singh • 51M views',
        thumbnail: 'https://i.ytimg.com/vi/yWNPxS0sXnE/hqdefault.jpg',
      },
      {
        id: 'yt_JqFzhcWo3EU',
        videoId: 'JqFzhcWo3EU',
        title: 'Yeshanagula (From "The Paradise")',
        artist: 'Anirudh Ravichander • 120M views',
        thumbnail: 'https://i.ytimg.com/vi/JqFzhcWo3EU/hqdefault.jpg',
      },
      {
        id: 'yt_DY31OTsxdBY',
        videoId: 'DY31OTsxdBY',
        title: 'Yaalalo Yaalalo',
        artist: 'Hesham Abdul Wahab & G.V. Prakash Kumar',
        thumbnail: 'https://i.ytimg.com/vi/DY31OTsxdBY/hqdefault.jpg',
      },
      {
        id: 'yt_mNlvxyKUzVw',
        videoId: 'mNlvxyKUzVw',
        title: 'Karthika Maasam',
        artist: 'G.V. Prakash Kumar & Shiva Nirvana',
        thumbnail: 'https://i.ytimg.com/vi/mNlvxyKUzVw/hqdefault.jpg',
      },
    ],
    newAlbums: [
      {
        id: 'MPREb_k5ySekCYEqV',
        title: 'Fallen Angel (Digital EP)',
        artist: 'JENNIE',
        thumbnail: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500',
        type: 'EP',
      },
      {
        id: 'MPREb_rgAwha8Ooqj',
        title: 'Raga Bhimpalasi — Echoes of Longing',
        artist: 'Dhyan',
        thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500',
        type: 'Album',
      },
    ],
    newMusicVideos: [
      {
        videoId: 'vrOCv5SOTrU',
        title: 'Jaadugari (AMAN)',
        artist: 'YRF',
        views: '1.4M views',
        thumbnail: 'https://i.ytimg.com/vi/vrOCv5SOTrU/hqdefault.jpg',
      },
      {
        videoId: '1ZntFlgJPDA',
        title: 'Boohe Baarian',
        artist: 'Aditya Rikhari',
        views: '3.4M views',
        thumbnail: 'https://i.ytimg.com/vi/1ZntFlgJPDA/hqdefault.jpg',
      },
    ],
    moods: OFFICIAL_MOODS,
    genres: OFFICIAL_GENRES,
    timestamp: Date.now(),
  };
}

/**
 * Fetches dynamic category details (playlists, songs, albums) when user taps on any Mood or Genre.
 * Uses InnerTube API: browseId: 'FEmusic_moods_and_genres_category' with specific params.
 */
export async function fetchCategoryDetails(
  paramsToken: string,
  categoryTitle = 'Explore'
): Promise<CategoryDetailResult> {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240105.01.00',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/moods_and_genres',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240105.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId: 'FEmusic_moods_and_genres_category',
        params: paramsToken,
      }),
    });

    if (!res.ok) {
      throw new Error(`Category details failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    const title = data.header?.musicHeaderRenderer?.title?.runs?.map((r: any) => r.text).join('') || categoryTitle;
    const sectionList =
      data.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
        ?.contents || [];

    const shelves: CategoryShelf[] = [];

    for (const sec of sectionList) {
      const shelfRenderer = sec.musicCarouselShelfRenderer || sec.gridRenderer;
      if (!shelfRenderer) continue;

      const shelfTitle =
        shelfRenderer.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map((r: any) => r.text).join('') ||
        shelfRenderer.header?.gridHeaderRenderer?.title?.runs?.map((r: any) => r.text).join('') ||
        'Featured';

      const itemsNode = shelfRenderer.contents || shelfRenderer.items || [];
      const shelfItems: CategoryShelfItem[] = [];

      for (const it of itemsNode) {
        const twoRow = it.musicTwoRowItemRenderer;
        const responsive = it.musicResponsiveListItemRenderer;

        if (twoRow) {
          const itemTitle = twoRow.title?.runs?.map((r: any) => r.text).join('') || '';
          const subtitle = twoRow.subtitle?.runs?.map((r: any) => r.text).join('') || '';
          const browseEndpoint = twoRow.navigationEndpoint?.browseEndpoint;
          const watchEndpoint = twoRow.navigationEndpoint?.watchEndpoint;
          const browseId = browseEndpoint?.browseId || '';
          const videoId = watchEndpoint?.videoId || '';
          const id = browseId || videoId || '';
          const thumb =
            twoRow.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

          if (itemTitle && id) {
            const isPl = !!browseEndpoint || browseId.startsWith('VL') || browseId.startsWith('MPREb');
            shelfItems.push({
              id: browseId
                ? browseId.startsWith('VL') || browseId.startsWith('MPREb')
                  ? browseId
                  : `VL${browseId}`
                : `yt_${videoId}`,
              videoId: videoId || undefined,
              title: itemTitle,
              subtitle,
              thumbnail: normalizeExploreUrl(thumb),
              isPlaylist: isPl,
              isVideo: !!watchEndpoint,
              isSong: !isPl,
            });
          }
        } else if (responsive) {
          const flexCols = responsive.flexColumns || [];
          const itemTitle =
            flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
          const subtitle =
            flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
          const albumText =
            flexCols[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
          const videoId =
            responsive.playlistItemData?.videoId ||
            responsive.navigationEndpoint?.watchEndpoint?.videoId ||
            responsive.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
              ?.playNavigationEndpoint?.watchEndpoint?.videoId ||
            '';
          const thumb =
            responsive.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

          if (itemTitle && videoId) {
            shelfItems.push({
              id: `yt_${videoId}`,
              videoId,
              title: itemTitle,
              subtitle,
              album: albumText,
              thumbnail: normalizeExploreUrl(thumb),
              isSong: true,
              isPlaylist: false,
              isVideo: true,
            });
          }
        }
      }

      if (shelfItems.length > 0) {
        const isSongsShelf =
          shelfTitle.toLowerCase().trim() === 'songs' ||
          shelfTitle.toLowerCase().includes('trending songs') ||
          shelfItems.every((it) => it.isSong);
        shelves.push({
          title: shelfTitle,
          isSongsShelf,
          items: shelfItems,
        });
      }
    }

    return {
      title,
      shelves,
    };
  } catch (err) {
    console.warn('[youtubeExploreService] Error fetching category details:', err);
    return {
      title: categoryTitle,
      shelves: [],
    };
  }
}

/**
 * Fetches the full contents of a YouTube Music playlist or album (e.g. 'Coffee Shop Blend').
 * Returns metadata (title, subtitle, description, artwork) and all individual playable tracks.
 */
export async function fetchPlaylistDetails(playlistBrowseId: string): Promise<ExplorePlaylistDetail> {
  const targetBrowseId =
    playlistBrowseId.startsWith('VL') || playlistBrowseId.startsWith('MPREb')
      ? playlistBrowseId
      : `VL${playlistBrowseId}`;

  const cacheKey = `@shorty_yt_pl_${targetBrowseId}`;
  try {
    const cached = await SafeStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as ExplorePlaylistDetail;
      if (parsed && parsed.tracks?.length > 0) return parsed;
    }
  } catch {}

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20240105.01.00',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20240105.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId: targetBrowseId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Playlist fetch failed with HTTP ${res.status}`);
    }

    const data = await res.json();
    const twoCol = data.contents?.twoColumnBrowseResultsRenderer;
    const singleCol = data.contents?.singleColumnBrowseResultsRenderer;

    const tab0 = twoCol?.tabs?.[0]?.tabRenderer || singleCol?.tabs?.[0]?.tabRenderer;
    const sec0 = tab0?.content?.sectionListRenderer?.contents?.[0];
    const header =
      sec0?.musicResponsiveHeaderRenderer ||
      data.header?.musicResponsiveHeaderRenderer ||
      data.header?.musicDetailHeaderRenderer;

    const title = header?.title?.runs?.map((r: any) => r.text).join('') || 'Playlist';
    const subtitle = header?.subtitle?.runs?.map((r: any) => r.text).join('') || '';
    const secondSubtitle = header?.secondSubtitle?.runs?.map((r: any) => r.text).join('') || '';
    const description =
      header?.description?.musicDescriptionShelfRenderer?.description?.runs?.map((r: any) => r.text).join('') ||
      header?.description?.runs?.map((r: any) => r.text).join('') ||
      '';
    const thumb =
      header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    const secContents =
      twoCol?.secondaryContents?.sectionListRenderer?.contents ||
      tab0?.content?.sectionListRenderer?.contents ||
      [];

    let trackContents: any[] = [];
    for (const s of secContents) {
      if (s.musicPlaylistShelfRenderer?.contents) {
        trackContents = s.musicPlaylistShelfRenderer.contents;
        break;
      }
      if (s.musicShelfRenderer?.contents) {
        trackContents = s.musicShelfRenderer.contents;
        break;
      }
    }

    const tracks: ExplorePlaylistTrack[] = [];
    for (const item of trackContents) {
      const resp = item.musicResponsiveListItemRenderer;
      if (!resp) continue;

      const flexCols = resp.flexColumns || [];
      const trackTitle =
        flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
      const trackArtist =
        flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join('') || '';
      const videoId =
        resp.playlistItemData?.videoId ||
        resp.navigationEndpoint?.watchEndpoint?.videoId ||
        resp.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
          ?.watchEndpoint?.videoId ||
        '';
      const trackThumb =
        resp.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : thumb);
      const duration =
        resp.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs
          ?.map((r: any) => r.text)
          .join('') || '';

      if (trackTitle && videoId) {
        tracks.push({
          id: `yt_${videoId}`,
          videoId,
          title: trackTitle,
          artist: trackArtist,
          album: title,
          duration,
          thumbnail: normalizeExploreUrl(trackThumb),
        });
      }
    }

    const result: ExplorePlaylistDetail = {
      id: targetBrowseId,
      title,
      subtitle,
      secondSubtitle,
      description,
      thumbnail: normalizeExploreUrl(thumb),
      trackCount: tracks.length,
      tracks,
    };

    SafeStorage.setItem(cacheKey, JSON.stringify(result)).catch(() => {});
    return result;
  } catch (err) {
    console.warn('[youtubeExploreService] Error fetching playlist details:', err);
    return {
      id: targetBrowseId,
      title: 'Playlist',
      subtitle: '',
      secondSubtitle: '',
      description: '',
      thumbnail: '',
      trackCount: 0,
      tracks: [],
    };
  }
}

/**
 * Transforms an ExplorePlaylistTrack into Shorty's Song model
 */
export function explorePlaylistTrackToSong(track: ExplorePlaylistTrack, playlistTitle?: string): Song {
  let durationSec = 210;
  if (track.duration) {
    const parts = track.duration.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      durationSec = parts[0] * 60 + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  return {
    id: track.id.startsWith('yt_') ? track.id : `yt_${track.videoId}`,
    name: track.title,
    artist: track.artist,
    album: playlistTitle || track.album || 'YouTube Music Explore',
    duration: durationSec,
    cover: track.thumbnail || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    streamUrl: `https://www.youtube.com/watch?v=${track.videoId}`,
    quality: 'Opus',
    source: 'youtube',
    sourceBadge: YOUTUBE_OPUS_BADGE,
    hasLyrics: false,
  };
}
