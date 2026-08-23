select cron.schedule(
  'followup-vendedor-enviar-cron',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/followup-vendedor-enviar',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $$
);
