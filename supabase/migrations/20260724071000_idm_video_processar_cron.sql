SELECT cron.schedule(
  'idm-video-processar-cron',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/idm-video-processar',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 300000
    );
  $$
);
