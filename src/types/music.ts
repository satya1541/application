export type AudioSourcePlatform = 'jiosaavn' | 'youtube' | 'soundcloud' | 'local';

export interface SourceBadge {
  name: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  qualityLabel: string;
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  year?: string;
  duration: number; // in seconds
  cover: string; // high-res cover art url
  streamUrl: string; // direct audio url
  quality: 'Lossless' | '320kbps' | '160kbps' | '128kbps' | 'Opus';
  source?: AudioSourcePlatform;
  language?: string;
  hasLyrics?: boolean;
  lyrics?: string[];
  gradientColors?: [string, string];
  sourceBadge?: SourceBadge;
  isRecommended?: boolean;
  recommendReason?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  cover: string;
  songCount: number;
  songs: Song[];
  isPinned?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  image: string;
  monthlyListeners: string;
  verified?: boolean;
  topSongs: Song[];
}

export interface AudioAcousticProfile {
  id: string;
  name: string;
  icon: string;
  description: string;
  bassBoost: number; // in dB
  trebleBoost: number;
  midBoost: number;
  reverbLevel: number;
}

export type RepeatMode = 'off' | 'all' | 'one';
