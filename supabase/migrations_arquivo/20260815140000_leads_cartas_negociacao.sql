-- ================================================================
-- Cartas de negociação (desconto/parcelamento/bônus) que os
-- vendedores consultam em Leads Diretos, editáveis só por admin.
-- Ver spec: docs/superpowers/specs/2026-08-15-leads-diretos-vendedores-cartas-design.md
-- ================================================================

CREATE TABLE IF NOT EXISTS public.leads_cartas_negociacao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT NOT NULL,
  descricao   TEXT NOT NULL DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('desconto', 'parcelamento', 'bonus', 'outro')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads_cartas_negociacao ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_cartas_negociacao' AND policyname='leads_cartas_negociacao_authenticated') THEN
    CREATE POLICY "leads_cartas_negociacao_authenticated" ON public.leads_cartas_negociacao
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lead_cartas_usadas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  carta_id   UUID NOT NULL REFERENCES public.leads_cartas_negociacao(id) ON DELETE CASCADE,
  usado_por  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  usado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, carta_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_cartas_usadas_lead ON public.lead_cartas_usadas (lead_id);

ALTER TABLE public.lead_cartas_usadas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lead_cartas_usadas' AND policyname='lead_cartas_usadas_authenticated') THEN
    CREATE POLICY "lead_cartas_usadas_authenticated" ON public.lead_cartas_usadas
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
