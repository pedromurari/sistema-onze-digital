ALTER TABLE boas_vindas_logs
  ADD COLUMN IF NOT EXISTS respondeu_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_resposta text;

ALTER TABLE boas_vindas_config
  ADD COLUMN IF NOT EXISTS wpp_mensagem_tarde text;
