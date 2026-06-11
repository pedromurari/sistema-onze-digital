-- Disparo server-side: pg_cron chama funil-processar a cada 5 min via pg_net
-- Independente do browser — roda 24h dentro do próprio Supabase

CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Remove job anterior se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'funil-processar-cron') THEN
    PERFORM cron.unschedule('funil-processar-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'funil-processar-cron',
  '*/5 * * * *',
  $cron$
    SELECT extensions.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/funil-processar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   'funil-processar-internal-2026'
      ),
      body    := '{}',
      timeout_milliseconds := 55000
    );
  $cron$
);
