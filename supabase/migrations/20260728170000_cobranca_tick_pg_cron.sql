-- cobrar-vencimentos-diario apontava pra uma função que não existe mais
-- (cobrar-vencimentos) -- lixo de uma versão anterior do sistema de cobrança, rodando
-- todo dia sem fazer nada há mais de uma semana. Removendo.
SELECT cron.unschedule('cobrar-vencimentos-diario');

-- Tique real da cobrança: chama enviar-cobranca a cada minuto (mesmo padrão de
-- disparo-runner-every-minute). Cada chamada só manda no máximo 1 mensagem, e só se as
-- regras de horário/limite/delay permitirem -- rodar de minuto em minuto só garante que o
-- envio sai assim que a janela abrir, não que vá mandar mais rápido do que configurado.
SELECT cron.schedule(
  'enviar-cobranca-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/enviar-cobranca',
    body    := '{"tick": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key',   'enviar-cobranca-internal-2026'
    ),
    timeout_milliseconds := 30000
  );
  $$
);
