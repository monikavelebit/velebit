-- ============================================================================
-- Velebit Console — automatic weekly backup schedule (pg_cron + pg_net)
-- ============================================================================
--
-- What this schedules:
--   Once a week, calls the `backup-data` Edge Function (see
--   supabase/functions/backup-data/index.ts), which reads every row out of
--   the `kv_store` table, bundles it into one JSON file, and uploads it to
--   the private `backups` Storage bucket (keeping the most recent 12).
--
-- Live values, verified directly against the Supabase project's `cron.job`
-- table (not reconstructed/guessed):
--   jobname : weekly-velebit-backup
--   schedule: 0 3 * * 0   (03:00 UTC every Sunday)
--
-- Prerequisites (already satisfied on this project, listed for reproducing
-- this on a new/replacement Supabase project):
--   - the `pg_cron` extension enabled
--   - the `pg_net` extension enabled (provides `net.http_post`, used to call
--     the Edge Function over HTTPS from inside Postgres)
--   - the `backup-data` Edge Function already deployed
--   - a bearer token with permission to invoke the function. This project
--     uses the Supabase service-role key. NEVER commit that value — see the
--     placeholder and warning below.
--
-- SECURITY — do not fill in a real secret here:
--   <SERVICE_ROLE_OR_FUNCTION_SECRET> below is a placeholder. Replace it only
--   when actually running this statement by hand in the Supabase SQL editor,
--   pulling the real value from Project Settings → API (service_role key) or
--   Vault, and NEVER paste the filled-in version back into this repo, a
--   commit, an issue, or anywhere else version-controlled.
--
-- This file is documentation/reproducibility only. Running it again against
-- the live project would create a SECOND cron job unless the existing one is
-- unscheduled first (see cron.unschedule('weekly-velebit-backup') in the
-- pg_cron docs) — this file does not do that automatically, on purpose.

select cron.schedule(
  'weekly-velebit-backup',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := 'https://znagrcavnkfigseqqgfz.supabase.co/functions/v1/backup-data',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_OR_FUNCTION_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
