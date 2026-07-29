-- evo-resposta grava a resposta do WhatsApp aqui, mesmo padrão de lead_respostas_evo_webhook
-- pras outras fontes (lancamento_leads, disparo_leads, boas_vindas_logs).
ALTER TABLE cobranca_logs ADD COLUMN IF NOT EXISTS respondeu_em TIMESTAMPTZ;
ALTER TABLE cobranca_logs ADD COLUMN IF NOT EXISTS ultima_resposta TEXT;
