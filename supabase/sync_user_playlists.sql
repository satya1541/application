-- =============================================================================
-- SHORTY MUSIC - USER PLAYLISTS CLOUD SYNC & DELETION SCRIPT FOR SUPABASE
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- =============================================================================

-- 1. Ensure table exists with base columns
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

-- 2. Drop dependent policies that lock the column types in Postgres
DO $$
BEGIN
  -- Drop policies on user_playlist_tracks if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_playlist_tracks') THEN
    DROP POLICY IF EXISTS "Users can view tracks of accessible playlists" ON public.user_playlist_tracks;
    DROP POLICY IF EXISTS "Users can manage tracks of own playlists" ON public.user_playlist_tracks;
  END IF;
END $$;

-- Drop all existing policies on user_playlists
DROP POLICY IF EXISTS "Users can view own and public playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Users can manage own playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Users can insert own playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Users can update own playlists" ON public.user_playlists;
DROP POLICY IF EXISTS "Users can delete own playlists" ON public.user_playlists;

-- 3. Drop foreign key constraint between user_playlist_tracks and user_playlists (if present)
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_playlist_tracks') THEN
    FOR constraint_rec IN 
      SELECT conname 
      FROM pg_constraint 
      WHERE conrelid = 'public.user_playlist_tracks'::regclass 
        AND contype = 'f'
    LOOP
      EXECUTE 'ALTER TABLE public.user_playlist_tracks DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
    END LOOP;
  END IF;
END $$;

-- 4. Safely alter column types to TEXT
DO $$
BEGIN
  -- Change user_playlists.id to TEXT if it was UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_playlists' 
      AND column_name = 'id' 
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_playlists ALTER COLUMN id TYPE TEXT USING id::TEXT;
  END IF;

  -- Change user_playlist_tracks.playlist_id to TEXT if it was UUID
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_playlist_tracks' 
      AND column_name = 'playlist_id' 
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_playlist_tracks ALTER COLUMN playlist_id TYPE TEXT USING playlist_id::TEXT;
  END IF;

  -- Add songs JSONB column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'user_playlists' 
      AND column_name = 'songs'
  ) THEN
    ALTER TABLE public.user_playlists ADD COLUMN songs JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 5. Re-add foreign key constraint on user_playlist_tracks if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_playlist_tracks') THEN
    ALTER TABLE public.user_playlist_tracks 
      ADD CONSTRAINT user_playlist_tracks_playlist_id_fkey 
      FOREIGN KEY (playlist_id) REFERENCES public.user_playlists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;

-- 7. Setup complete Row Level Security policies on user_playlists
CREATE POLICY "Users can view own and public playlists" 
  ON public.user_playlists FOR SELECT 
  TO authenticated, anon
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own playlists" 
  ON public.user_playlists FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists" 
  ON public.user_playlists FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists" 
  ON public.user_playlists FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- 8. Re-enable user_playlist_tracks policies if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_playlist_tracks') THEN
    ALTER TABLE public.user_playlist_tracks ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Users can view tracks of accessible playlists" 
      ON public.user_playlist_tracks FOR SELECT 
      TO authenticated, anon
      USING (
        EXISTS (
          SELECT 1 FROM public.user_playlists p 
          WHERE p.id = playlist_id AND (p.user_id = auth.uid() OR p.is_public = true)
        )
      );

    CREATE POLICY "Users can manage tracks of own playlists" 
      ON public.user_playlist_tracks FOR ALL 
      TO authenticated 
      USING (
        EXISTS (
          SELECT 1 FROM public.user_playlists p 
          WHERE p.id = playlist_id AND p.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 9. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_playlists TO authenticated;
GRANT SELECT ON public.user_playlists TO anon;
