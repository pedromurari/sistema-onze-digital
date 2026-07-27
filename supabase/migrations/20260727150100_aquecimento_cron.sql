-- Cron do Aquecimento de Chips: planejamento diário + worker de envio.
-- x-cron-key resolvido em runtime via public.get_equipe_11ds_cron_secret()
-- (Supabase Vault), mesmo padrão de equipe-11ds-diario-cron/idm-video-processar-cron.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquecimento-planejar-dia-cron') THEN
    PERFORM cron.unschedule('aquecimento-planejar-dia-cron');
  END IF;
END $$;

-- 09:00 UTC = 06:00 America/Sao_Paulo (Brasil sem horário de verão)
SELECT cron.schedule(
  'aquecimento-planejar-dia-cron',
  '0 9 * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/aquecimento-planejar-dia',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquecimento-worker-cron') THEN
    PERFORM cron.unschedule('aquecimento-worker-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'aquecimento-worker-cron',
  '*/3 * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/aquecimento-worker',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);
