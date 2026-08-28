-- Alerta diário de WhatsApp pro vendedor quando um follow-up manual vence
-- (ver supabase/functions/time-comercial-followup-alerta). 9h America/Sao_Paulo
-- (UTC-3) -> 12h UTC.
select cron.schedule(
  'time-comercial-followup-alerta-cron',
  '0 12 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/time-comercial-followup-alerta',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $$
);
