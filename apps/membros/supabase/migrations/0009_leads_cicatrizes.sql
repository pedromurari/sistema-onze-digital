-- ============================================================
-- IDM Tools — Leads do Cicatrizes que Curam (captura antes da compra)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads_cicatrizes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  email           TEXT NOT NULL,
  whatsapp        TEXT NOT NULL,
  email_enviado   BOOLEAN NOT NULL DEFAULT FALSE,
  wpp_enviado     BOOLEAN NOT NULL DEFAULT FALSE,
  comprou         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_cicatrizes_email ON public.leads_cicatrizes(email);

CREATE OR REPLACE FUNCTION public.update_leads_cicatrizes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_cicatrizes_updated_at
  BEFORE UPDATE ON public.leads_cicatrizes
  FOR EACH ROW EXECUTE FUNCTION public.update_leads_cicatrizes_updated_at();

-- RLS ativado, sem policies: acesso só via service role (rota server-side).
ALTER TABLE public.leads_cicatrizes ENABLE ROW LEVEL SECURITY;
