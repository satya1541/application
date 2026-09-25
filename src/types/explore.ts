import { RankingMode } from './recommendation';

export type AudioSourcePlatform = 'jiosaavn' | 'youtube' | 'soundcloud' | 'local';

export interface SourceBadge {
  name: string;
  icon: string;
  logoUrl?: string;
  color: string;
  bg: string;
  border: string;
  qualityLabel: string;
}

export interface CanonicalEntityBase {
  id: string;
  name: string;
  cover: string;
  source: AudioSourcePlatform | 'mixed';
}

export interface CanonicalArtist extends CanonicalEntityBase {
  type: 'artist';
  role?: string;
  monthlyListeners?: string;
  verified?: boolean;
}

export interface CanonicalAlbum extends CanonicalEntityBase {
  type: 'album';
  artist: string;
  year?: string;
  songCount?: number;
}

export interface ExploreSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  year?: string;
  duration: number; // in seconds
  cover: string; // 500x500 high-res cover art
  streamUrl: string; // direct 320kbps / high-quality media url
  quality: 'Lossless' | '320kbps' | '160kbps' | '128kbps' | '96kbps' | 'Opus';
  source?: AudioSourcePlatform;
  sourceBadge?: SourceBadge;
  language?: string;
  hasLyrics?: boolean;
  lyrics?: string[];
  gradientColors?: [string, string];
  rankingMode?: RankingMode;
}

export interface CanonicalSong extends ExploreSong {
  type: 'song';
  fallbackSources?: Array<{
    source: AudioSourcePlatform;
    id: string;
    streamUrl: string;
    quality: string;
    sourceBadge?: SourceBadge;
  }>;
}

export interface ExploreSearchResult {
  topResult?: CanonicalArtist | CanonicalAlbum | CanonicalSong;
  songs: CanonicalSong[];
  artists: CanonicalArtist[];
  albums: CanonicalAlbum[];
  correctedQuery?: string;
  intent?: { primary: string; confidence: number };
  sections?: Array<'TopResult' | 'Artists' | 'Albums' | 'Songs'>;
}

