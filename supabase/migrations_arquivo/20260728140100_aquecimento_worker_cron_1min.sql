-- Worker de aquecimento passa a rodar a cada 1 min (era 3 min) -- necessário
-- pra respeitar o espaçamento fino entre mensagens de uma mesma sessão de
-- conversa (20-90s), que com tick de 3 em 3 minutos acumulava e disparava
-- em rajada.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aquecimento-worker-cron') THEN
    PERFORM cron.unschedule('aquecimento-worker-cron');
  END IF;
END $$;

SELECT cron.schedule(
  'aquecimento-worker-cron',
  '* * * * *',
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
