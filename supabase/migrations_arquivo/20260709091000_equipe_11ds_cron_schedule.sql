-- Automacao diaria da Equipe 11DS: 1x por dia, cria e executa o post do dia
-- para cada cliente ativo em conteudo_clientes, via equipe-11ds-diario.
-- O x-cron-key e' resolvido em runtime via public.get_equipe_11ds_cron_secret()
-- (Supabase Vault) para nunca ficar em texto puro nesta migration.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'equipe-11ds-diario-cron') THEN
    PERFORM cron.unschedule('equipe-11ds-diario-cron');
  END IF;
END $$;

-- 11:00 UTC = 08:00 America/Sao_Paulo (Brasil sem horario de verao)
SELECT cron.schedule(
  'equipe-11ds-diario-cron',
  '0 11 * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/equipe-11ds-diario',
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key',   public.get_equipe_11ds_cron_secret()
      ),
      timeout_milliseconds := 55000
    );
  $cron$
);
