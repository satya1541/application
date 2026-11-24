import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song } from '@/types/music';

export const CHARTS_BASE_URL = 'https://ext.sevennova.in/api/charts';

export type PlatformType = 'youtube' | 'spotify' | 'gaana' | 'apple_music' | 'billboard';

export interface ChartSummary {
  id: string;
  name: string;
  platform: PlatformType;
  country?: string;
  category?: string;
  totalTracks: number;
  lastUpdated: string;
  topTrack?: {
    rank: number;
    title: string;
    artist: string;
    cover: string;
  };
}

export interface JioSaavnMatch {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  streamUrl?: string;
  mediaUrl?: string;
  quality: 'Lossless' | '320kbps' | '160kbps';
  hasLyrics: boolean;
  score: number;
}

export interface YouTubeMatch {
  videoId: string;
  name: string;
  channelName: string;
  duration: number;
  thumbnail: string;
  streamUrl: string;
  quality: 'Opus 160kbps' | 'M4A';
  score: number;
}

export interface ResolvedChartTrack {
  rank: number;
  originalTitle: string;
  originalArtist: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  matchScore: number;
  platform: PlatformType;
  streams: {
    saavn?: JioSaavnMatch;
    youtube?: YouTubeMatch;
  };
  preferredSource: 'jiosaavn' | 'youtube';
}

export interface ChartPayload {
  id: string;
  name: string;
  platform: PlatformType;
  country?: string;
  lastUpdated: string;
  totalTracks: number;
  sourceUrl: string;
  tracks: ResolvedChartTrack[];
}

export interface ChartEditorialMetadata {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  platform: PlatformType;
  platformLabel: string;
  badge: string;
  accentColor: string;
  gradientColors: [string, string];
  coverImage: string;
  city?: string;
}

/**
 * Editorial styling & fallback covers for each chart
 */
export const EDITORIAL_CHARTS_CONFIG: Record<string, ChartEditorialMetadata> = {
  'apple-music-top-100-india': {
    id: 'apple-music-top-100-india',
    title: 'Top 100: India',
    subtitle: 'National Leaderboard',
    description: 'The most popular songs in India right now, updated daily by Apple Music.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'National #1',
    accentColor: '#FC3C44',
    gradientColors: ['#FC3C44', '#700B1A'],
    coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=900&auto=format&fit=crop&q=85',
  },
  'spotify-india': {
    id: 'spotify-india',
    title: 'Spotify Top 100',
    subtitle: 'Daily Viral Hits',
    description: 'India’s most streamed viral tracks and trending anthems on Spotify.',
    platform: 'spotify',
    platformLabel: 'Spotify',
    badge: 'Viral Hits',
    accentColor: '#1DB954',
    gradientColors: ['#1DB954', '#0D4F24'],
    coverImage: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&auto=format&fit=crop&q=85',
  },
  'youtube-india': {
    id: 'youtube-india',
    title: 'YouTube Top 100',
    subtitle: 'Trending Music Videos',
    description: 'The most-viewed weekly music videos and tracks across India on YouTube.',
    platform: 'youtube',
    platformLabel: 'YouTube Music',
    badge: 'Trending',
    accentColor: '#FF0000',
    gradientColors: ['#FF0000', '#5E0000'],
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=85',
  },
  'gaana-worldwide': {
    id: 'gaana-worldwide',
    title: 'Gaana Worldwide',
    subtitle: 'Bollywood & Beyond',
    description: 'Global Hindi, Bollywood, and regional chartbusters trending worldwide.',
    platform: 'gaana',
    platformLabel: 'Gaana',
    badge: 'Worldwide',
    accentColor: '#E72C30',
    gradientColors: ['#E72C30', '#631012'],
    coverImage: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=900&auto=format&fit=crop&q=85',
  },
  'apple-music-top-25-mumbai': {
    id: 'apple-music-top-25-mumbai',
    title: 'Top 25: Mumbai',
    subtitle: 'City of Dreams',
    description: 'The tracks taking over Mumbai right now — from Bollywood to street rap.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'City Chart',
    accentColor: '#F59E0B',
    gradientColors: ['#F59E0B', '#78350F'],
    coverImage: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=900&auto=format&fit=crop&q=85',
    city: 'Mumbai',
  },
  'apple-music-top-25-delhi': {
    id: 'apple-music-top-25-delhi',
    title: 'Top 25: Delhi',
    subtitle: 'Capital Beats',
    description: 'The high-energy Punjabi, Desi hip-hop, and pop hits ruling Delhi NCR.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'City Chart',
    accentColor: '#8B5CF6',
    gradientColors: ['#8B5CF6', '#3B0764'],
    coverImage: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=900&auto=format&fit=crop&q=85',
    city: 'Delhi',
  },
  'apple-music-top-25-bengaluru': {
    id: 'apple-music-top-25-bengaluru',
    title: 'Top 25: Bengaluru',
    subtitle: 'Silicon & Sound',
    description: 'The distinct mix of Kannada hits, South pop, Indie and International beats in Bengaluru.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'City Chart',
    accentColor: '#06B6D4',
    gradientColors: ['#06B6D4', '#164E63'],
    coverImage: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=900&auto=format&fit=crop&q=85',
    city: 'Bengaluru',
  },
  'apple-music-top-25-dubai': {
    id: 'apple-music-top-25-dubai',
    title: 'Top 25: Dubai',
    subtitle: 'Global Crossroads',
    description: 'The luxury blend of South Asian, Arabic, and Western hits topping the charts in Dubai.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'City Chart',
    accentColor: '#EC4899',
    gradientColors: ['#EC4899', '#831843'],
    coverImage: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=900&auto=format&fit=crop&q=85',
    city: 'Dubai',
  },
  'apple-music-top-charts-songs': {
    id: 'apple-music-top-charts-songs',
    title: 'Top Songs Chart',
    subtitle: 'Official Ranking',
    description: 'Top individual song streams in India across all genres on Apple Music.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'Top 50',
    accentColor: '#3B82F6',
    gradientColors: ['#3B82F6', '#1E3A8A'],
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&auto=format&fit=crop&q=85',
  },
  'apple-music-top-charts-playlists': {
    id: 'apple-music-top-charts-playlists',
    title: 'Curated Playlists',
    subtitle: 'Editor’s Choice',
    description: 'Tracks selected from the highest-charting curated playlists across India.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'Curated',
    accentColor: '#10B981',
    gradientColors: ['#10B981', '#064E3B'],
    coverImage: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&auto=format&fit=crop&q=85',
  },
  'apple-music-top-charts-albums': {
    id: 'apple-music-top-charts-albums',
    title: 'Top Albums',
    subtitle: 'Complete Soundtracks',
    description: 'The most popular movie soundtracks and artist albums currently charting.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'Albums',
    accentColor: '#A855F7',
    gradientColors: ['#A855F7', '#581C87'],
    coverImage: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=900&auto=format&fit=crop&q=85',
  },
  'apple-music-top-charts-music-videos': {
    id: 'apple-music-top-charts-music-videos',
    title: 'Music Videos',
    subtitle: 'Visual Hits',
    description: 'Top-charting music video releases and visual anthems.',
    platform: 'apple_music',
    platformLabel: ' Apple Music',
    badge: 'Videos',
    accentColor: '#F43F5E',
    gradientColors: ['#F43F5E', '#881337'],
    coverImage: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=900&auto=format&fit=crop&q=85',
  },
};

const CACHE_SUMMARIES_KEY = '@shorty_charts_summaries_v1';
const CACHE_CHART_PREFIX = '@shorty_chart_data_v1_';

let memorySummariesCache: ChartSummary[] = [];
const memoryDetailCache = new Map<string, ChartPayload>();

/**
 * Converts a backend ResolvedChartTrack to the mobile app's Song object
 */
export function chartTrackToSong(track: ResolvedChartTrack, chartName?: string): Song {
  const saavn = track.streams?.saavn;
  const yt = track.streams?.youtube;

  const streamUrl = saavn?.streamUrl || saavn?.mediaUrl || yt?.streamUrl || '';
  const quality = saavn?.quality || (yt?.quality ? '160kbps' : '320kbps');
  const source = saavn?.streamUrl ? 'jiosaavn' : 'youtube';

  return {
    id: saavn?.id || yt?.videoId || `chart_${track.rank}_${encodeURIComponent(track.title)}`,
    name: track.title,
    artist: track.artist,
    album: track.album || chartName || 'Top Charts',
    duration: track.duration || saavn?.duration || yt?.duration || 210,
    cover: track.cover || saavn?.cover || yt?.thumbnail || '',
    streamUrl,
    quality: quality as any,
    source,
    hasLyrics: Boolean(saavn?.hasLyrics),
    sourceBadge: {
      name: source === 'jiosaavn' ? 'JioSaavn' : 'YouTube',
      icon: source === 'jiosaavn' ? 'musical-notes' : 'logo-youtube',
      color: source === 'jiosaavn' ? '#22C55E' : '#FF0000',
      bg: source === 'jiosaavn' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 0, 0, 0.15)',
      border: source === 'jiosaavn' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 0, 0, 0.35)',
      qualityLabel: quality === 'Lossless' ? 'Lossless' : quality,
    },
  };
}

/**
 * Fetch all chart summaries with 0ms instant cache return
 */
export async function fetchChartSummaries(forceRefresh: boolean = false): Promise<ChartSummary[]> {
  if (!forceRefresh && memorySummariesCache.length > 0) {
    return memorySummariesCache;
  }

  // Check persistent disk cache
  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(CACHE_SUMMARIES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChartSummary[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          memorySummariesCache = parsed;
          // Background refresh
          refreshSummariesInBackground();
          return parsed;
        }
      }
    } catch {}
  }

  try {
    const res = await fetch(`${CHARTS_BASE_URL}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.charts)) {
      memorySummariesCache = data.charts;
      AsyncStorage.setItem(CACHE_SUMMARIES_KEY, JSON.stringify(data.charts)).catch(() => {});
      return data.charts;
    }
  } catch (err) {
    console.warn('[ChartsApi] Failed to fetch summaries:', err);
  }

  // Return static catalog if offline
  return getStaticFallbackSummaries();
}

/**
 * Fetch complete chart tracks
 */
export async function fetchChartDetail(
  chartId: string,
  forceRefresh: boolean = false
): Promise<ChartPayload | null> {
  if (!forceRefresh && memoryDetailCache.has(chartId)) {
    return memoryDetailCache.get(chartId)!;
  }

  const cacheKey = CACHE_CHART_PREFIX + chartId;

  if (!forceRefresh) {
    try {
      const stored = await AsyncStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ChartPayload;
        if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
          memoryDetailCache.set(chartId, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  try {
    const res = await fetch(`${CHARTS_BASE_URL}/${chartId}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && data.chart) {
      memoryDetailCache.set(chartId, data.chart);
      AsyncStorage.setItem(cacheKey, JSON.stringify(data.chart)).catch(() => {});
      return data.chart;
    }
  } catch (err) {
    console.warn(`[ChartsApi] Failed to fetch chart ${chartId}:`, err);
  }

  return memoryDetailCache.get(chartId) || null;
}

function refreshSummariesInBackground() {
  fetch(`${CHARTS_BASE_URL}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.success && Array.isArray(data.charts)) {
        memorySummariesCache = data.charts;
        AsyncStorage.setItem(CACHE_SUMMARIES_KEY, JSON.stringify(data.charts)).catch(() => {});
      }
    })
    .catch(() => {});
}

export function getStaticFallbackSummaries(): ChartSummary[] {
  return Object.values(EDITORIAL_CHARTS_CONFIG).map((cfg) => ({
    id: cfg.id,
    name: cfg.title,
    platform: cfg.platform,
    country: cfg.id.includes('dubai') ? 'AE' : cfg.id.includes('worldwide') ? 'GLOBAL' : 'IN',
    category: cfg.subtitle,
    totalTracks: cfg.id.includes('top-25') ? 25 : cfg.id.includes('top-100') ? 100 : 50,
    lastUpdated: 'Today',
  }));
}
