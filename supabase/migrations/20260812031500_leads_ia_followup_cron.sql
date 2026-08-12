-- Agenda o cron do follow-up automático do SDR de leads (leads-ia-followup): a cada 30
-- minutos, checa se tem cutucada de silêncio (4h/24h/72h) ou lembrete de handoff parado
-- (2h+ sem resposta manual) pra disparar. Mesmo padrão de lead-primeiro-contato-tick.

select cron.schedule(
  'leads-ia-followup-tick',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/leads-ia-followup',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   public.get_equipe_11ds_cron_secret()
    ),
    timeout_milliseconds := 55000
  );
  $$
);
