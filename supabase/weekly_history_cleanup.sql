-- =============================================================================
-- SHORTY MUSIC - WEEKLY LISTENING HISTORY CLEANUP SCRIPT FOR SUPABASE
-- Run this in your Supabase SQL Editor: Dashboard -> SQL Editor -> New Query
-- =============================================================================

-- 1. Ensure DELETE permission is enabled under Row Level Security
DROP POLICY IF EXISTS "Users can delete own listening history" ON public.listening_history;
CREATE POLICY "Users can delete own listening history" 
  ON public.listening_history FOR DELETE 
  TO authenticated 
  USING (auth.uid() = user_id);

-- 2. Create the cleanup function (Deletes history records older than 7 days)
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
  RAISE NOTICE 'Pruned % old listening_history records older than % days', deleted_count, days_to_keep;
  RETURN deleted_count;
END;
$$;

-- Grant execution permissions so it can be invoked by cron or app RPC
GRANT EXECUTE ON FUNCTION public.cleanup_old_listening_history(INTEGER) TO postgres, authenticated, service_role;

-- 3. Enable pg_cron (Supabase built-in scheduler)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. Unschedule previous job if it exists, to avoid duplicates
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-cleanup-listening-history');
EXCEPTION WHEN OTHERS THEN
  -- Ignore if not yet scheduled
END $$;

-- 5. Schedule weekly execution: Every Sunday at 03:00 UTC (3:00 AM)
SELECT cron.schedule(
  'weekly-cleanup-listening-history',
  '0 3 * * 0', -- 03:00 every Sunday
  $$SELECT public.cleanup_old_listening_history(7)$$
);

-- 6. Immediate verification run (prunes any existing records > 7 days right now)
SELECT public.cleanup_old_listening_history(7) AS initial_deleted_records;
