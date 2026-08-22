-- Rastreio de resposta direto em disparo_leads, mesmo padrao ja usado em
-- lancamento_leads.ultima_resposta_at/ultima_resposta -- gravado por
-- evo-resposta quando uma mensagem inbound de WhatsApp casa por telefone.

ALTER TABLE disparo_leads
  ADD COLUMN IF NOT EXISTS respondeu_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_resposta TEXT;
