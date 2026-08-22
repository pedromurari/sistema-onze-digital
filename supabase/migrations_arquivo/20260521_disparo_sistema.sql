-- Cria tabelas de disparo se nao existirem (idempotente)
CREATE TABLE IF NOT EXISTS public.disparo_campanhas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  descricao        TEXT,
  template         TEXT NOT NULL DEFAULT '',
  message_type     TEXT NOT NULL DEFAULT 'text',
  media_url        TEXT,
  status           TEXT NOT NULL DEFAULT 'rascunho',
  leads_total      INTEGER NOT NULL DEFAULT 0,
  leads_sent       INTEGER NOT NULL DEFAULT 0,
  leads_error      INTEGER NOT NULL DEFAULT 0,
  leads_skipped    INTEGER NOT NULL DEFAULT 0,
  delay_min_s      INTEGER NOT NULL DEFAULT 8,
  delay_max_s      INTEGER NOT NULL DEFAULT 20,
  daily_limit      INTEGER NOT NULL DEFAULT 150,
  safe_hour_start  INTEGER NOT NULL DEFAULT 8,
  safe_hour_end    INTEGER NOT NULL DEFAULT 21,
  max_errors_seq   INTEGER NOT NULL DEFAULT 3,
  evolution_config_id TEXT NOT NULL DEFAULT 'default',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.disparo_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.disparo_campanhas(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  nome        TEXT,
  variaveis   JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pendente',
  error_msg   TEXT,
  sent_at     TIMESTAMPTZ,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona coluna em tabelas existentes (seguro se ja existe)
ALTER TABLE public.disparo_campanhas
  ADD COLUMN IF NOT EXISTS evolution_config_id TEXT NOT NULL DEFAULT 'default';

-- Indexes para performance do loop de envio
CREATE INDEX IF NOT EXISTS idx_disparo_leads_campanha_status ON public.disparo_leads(campanha_id, status);
CREATE INDEX IF NOT EXISTS idx_disparo_leads_campanha_ordem  ON public.disparo_leads(campanha_id, ordem);
CREATE INDEX IF NOT EXISTS idx_disparo_campanhas_status      ON public.disparo_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_disparo_leads_sent_at         ON public.disparo_leads(campanha_id, sent_at) WHERE status = 'enviado';

-- RLS
ALTER TABLE public.disparo_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_leads     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='disparo_campanhas' AND policyname='disparo_campanhas_auth') THEN
    CREATE POLICY "disparo_campanhas_auth" ON public.disparo_campanhas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='disparo_leads' AND policyname='disparo_leads_auth') THEN
    CREATE POLICY "disparo_leads_auth" ON public.disparo_leads
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Colunas extras do user_access_permissions que podem nao existir
ALTER TABLE public.user_access_permissions
  ADD COLUMN IF NOT EXISTS can_view_cobranca         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_financeiro_cfo   BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.user_access_permissions uap
SET can_view_cobranca       = TRUE,
    can_view_financeiro_cfo = TRUE,
    updated_at              = NOW()
FROM public.user_roles ur
WHERE ur.user_id = uap.user_id AND ur.role = 'admin';

-- Colunas grupo JID nas lancamentos (para webhook-grupo)
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS grupo_lancamento_jid TEXT,
  ADD COLUMN IF NOT EXISTS grupo_oferta_jid     TEXT;
