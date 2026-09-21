import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SafeStorage } from './storage';

// In Node.js SSR / prerender environments on web, window does not exist.
const isNodeServer = Platform.OS === 'web' && typeof window === 'undefined';

// Project default Supabase credentials (public anon client)
const DEFAULT_SUPABASE_URL = 'https://zdutzfrojytvjxpdffsv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_o3Ro3NE6C4owTe16r2auIg_TMpVeid1';

// Read public environment variables exposed by Expo, with automatic fallback for standalone builds
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

/**
 * Checks if Supabase credentials have been configured by the developer.
 */
export function isSupabaseConfigured(): boolean {
  return (
    typeof SUPABASE_URL === 'string' &&
    SUPABASE_URL.trim().length > 0 &&
    SUPABASE_URL.startsWith('http') &&
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY.trim().length > 0 &&
    !SUPABASE_URL.includes('your-project.supabase.co') &&
    !SUPABASE_URL.includes('placeholder.supabase.co')
  );
}

// Fallback dummy URL and anon key to prevent createClient from crashing if unconfigured
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? SUPABASE_URL : fallbackUrl,
  isSupabaseConfigured() ? SUPABASE_ANON_KEY : fallbackKey,
  {
    auth: {
      storage: SafeStorage,
      autoRefreshToken: !isNodeServer,
      persistSession: !isNodeServer,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  }
);

export type StreamingQuality = 'very_high' | 'high' | 'medium' | 'low';

export interface UserProfile {
  id: string;
  email?: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string;
  streaming_quality?: StreamingQuality;
  preferred_languages?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface LikedSongCloudItem {
  id?: string;
  user_id?: string;
  song_id: string;
  song_metadata: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    cover?: string;
    duration?: number;
    streamUrl?: string;
    source?: string;
    quality?: string;
  };
  created_at?: string;
}

export interface UserPlaylistCloudItem {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  cover_url?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  track_count?: number;
}

export interface SoundStats {
  totalMinutesListened: number;
  totalSongsPlayed: number;
  topArtists: { name: string; playCount: number }[];
  topGenres: { name: string; playCount: number }[];
  favoriteMood: string;
}
