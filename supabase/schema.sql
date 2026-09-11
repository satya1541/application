-- =============================================================================
-- SHORTY MUSIC - SUPABASE DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- Copy and run this script in your Supabase project's SQL Editor
-- =============================================================================

-- Enable pgcrypto for UUID generation if not already active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked to auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT 'Music Lover',
  avatar_url TEXT DEFAULT NULL,
  bio TEXT DEFAULT 'Vibing with Shorty 🎧',
  streaming_quality TEXT NOT NULL DEFAULT 'very_high',
  preferred_languages TEXT[] DEFAULT ARRAY['hindi', 'punjabi', 'english', 'sambalpuri'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view any profile" ON public.profiles;
CREATE POLICY "Users can view any profile" 
  ON public.profiles FOR SELECT 
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = id);

-- Trigger: Automatically create a profile entry whenever a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 2. USER LIKED SONGS (Cloud Synced Favorites)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_liked_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  song_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_liked_songs_user_song_idx 
  ON public.user_liked_songs (user_id, song_id);

ALTER TABLE public.user_liked_songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own liked songs" ON public.user_liked_songs;
CREATE POLICY "Users can view own liked songs" 
  ON public.user_liked_songs FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own liked songs" ON public.user_liked_songs;
CREATE POLICY "Users can insert own liked songs" 
  ON public.user_liked_songs FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own liked songs" ON public.user_liked_songs;
CREATE POLICY "Users can delete own liked songs" 
  ON public.user_liked_songs FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 3. USER CUSTOM PLAYLISTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_playlists (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT NULL,
  songs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own and public playlists" ON public.user_playlists;
CREATE POLICY "Users can view own and public playlists" 
  ON public.user_playlists FOR SELECT 
  TO authenticated, anon
  USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can manage own playlists" ON public.user_playlists;
CREATE POLICY "Users can manage own playlists" 
  ON public.user_playlists FOR ALL 
  TO authenticated 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4. USER PLAYLIST TRACKS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.user_playlists(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  song_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_playlist_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tracks of accessible playlists" ON public.user_playlist_tracks;
CREATE POLICY "Users can view tracks of accessible playlists" 
  ON public.user_playlist_tracks FOR SELECT 
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p 
      WHERE p.id = playlist_id AND (p.user_id = auth.uid() OR p.is_public = true)
    )
  );

DROP POLICY IF EXISTS "Users can manage tracks of own playlists" ON public.user_playlist_tracks;
CREATE POLICY "Users can manage tracks of own playlists" 
  ON public.user_playlist_tracks FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_playlists p 
      WHERE p.id = playlist_id AND p.user_id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 5. LISTENING HISTORY & STATS ("Shorty Wrapped")
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listening_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,
  song_title TEXT NOT NULL,
  artist TEXT NOT NULL,
  cover_url TEXT DEFAULT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listening_history_user_played_idx 
  ON public.listening_history (user_id, played_at DESC);

ALTER TABLE public.listening_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own listening history" ON public.listening_history;
CREATE POLICY "Users can view own listening history" 
  ON public.listening_history FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own listening history" ON public.listening_history;
CREATE POLICY "Users can insert own listening history" 
  ON public.listening_history FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own listening history" ON public.listening_history;
CREATE POLICY "Users can delete own listening history" 
  ON public.listening_history FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 6. AUTOMATED WEEKLY CLEANUP FOR LISTENING HISTORY
-- -----------------------------------------------------------------------------
-- Stored procedure to prune listening history entries older than 7 days
CREATE OR REPLACE FUNCTION public.cleanup_old_listening_history(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.listening_history
  WHERE played_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.cleanup_old_listening_history(INTEGER) TO postgres, authenticated, service_role;

-- Enable pg_cron extension (built-in on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule automated weekly cleanup (runs every Sunday at 03:00 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-cleanup-listening-history');
EXCEPTION WHEN OTHERS THEN
  -- Ignore if job doesn't exist yet
END $$;

SELECT cron.schedule(
  'weekly-cleanup-listening-history',
  '0 3 * * 0', -- Every Sunday at 03:00 UTC
  $$SELECT public.cleanup_old_listening_history(7)$$
);

