-- Cron das 2 functions de aquecimento de leads: fase (a cada 3min, mesmo
-- espaçamento do aquecimento de chips original) e isca (a cada 1min, pra
-- respeitar o delay curto configurado em minutos sem atraso perceptível).

SELECT cron.schedule(
  'aquecimento-lead-enviar-fase-cron',
  '*/3 * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/aquecimento-lead-enviar-fase',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);

SELECT cron.schedule(
  'aquecimento-lead-enviar-isca-cron',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/aquecimento-lead-enviar-isca',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);
