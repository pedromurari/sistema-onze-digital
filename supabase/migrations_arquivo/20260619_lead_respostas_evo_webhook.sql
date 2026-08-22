-- Histórico de respostas recebidas via WhatsApp
CREATE TABLE IF NOT EXISTS public.lead_respostas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES public.lancamento_leads(id) ON DELETE CASCADE,
  lancamento_id     uuid,
  phone             text NOT NULL,
  mensagem          text,
  mensagem_tipo     text DEFAULT 'text',
  evolution_instance text,
  lida              boolean NOT NULL DEFAULT false,
  recebido_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_respostas_lead    ON public.lead_respostas (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_respostas_recv    ON public.lead_respostas (recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_lead_respostas_nao_lida ON public.lead_respostas (lida) WHERE NOT lida;

-- Rastreio de última resposta direto no lead
ALTER TABLE public.lancamento_leads
  ADD COLUMN IF NOT EXISTS ultima_resposta_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_resposta     text;

-- RLS: só admins leem respostas, a edge function usa service role key
ALTER TABLE public.lead_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read lead_respostas"
  ON public.lead_respostas FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
