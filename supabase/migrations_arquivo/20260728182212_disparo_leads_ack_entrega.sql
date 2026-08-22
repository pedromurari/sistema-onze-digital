-- "Enviado" em disparo_leads hoje só significa que a Evolution API respondeu
-- HTTP 200 ao pedido de envio -- isso não confirma que o WhatsApp entregou a
-- mensagem (a API aceita a chamada mesmo com sessão instável/fechada). Este
-- ACK real (mesmo padrão já usado em aquecimento_jobs) vem do webhook
-- messages.update disparado pelo próprio WhatsApp.
ALTER TABLE public.disparo_leads
  ADD COLUMN IF NOT EXISTS evolution_message_id TEXT,
  ADD COLUMN IF NOT EXISTS ack_status TEXT CHECK (ack_status IN ('entregue', 'lido', 'falhou')),
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lido_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_disparo_leads_evolution_message_id
  ON public.disparo_leads (evolution_message_id) WHERE evolution_message_id IS NOT NULL;
