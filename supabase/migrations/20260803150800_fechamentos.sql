-- ================================================================
-- Fechamentos: snapshot travado de um período financeiro (dia, semana,
-- mês, trimestre, semestre ou ano) na página Balanço. Ao fechar um
-- período, os números (bruto/taxas/líquido/repasses/saldo) são
-- congelados aqui e a UI para de recalcular a partir de `pagamentos` —
-- só volta a recalcular se o período for reaberto. Períodos ainda não
-- fechados não têm linha aqui; a UI mostra os números ao vivo com um
-- aviso de "não fechado".
-- ================================================================

CREATE TABLE IF NOT EXISTS public.fechamentos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_tipo          TEXT NOT NULL CHECK (periodo_tipo IN ('dia','semana','mes','trimestre','semestre','ano')),
  periodo_key           TEXT NOT NULL,
  periodo_inicio        DATE NOT NULL,
  periodo_fim           DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  bruto                 NUMERIC NOT NULL DEFAULT 0,
  taxas                 NUMERIC NOT NULL DEFAULT 0,
  liquido               NUMERIC NOT NULL DEFAULT 0,
  repasses              JSONB NOT NULL DEFAULT '[]'::jsonb,
  saldo_idm             NUMERIC NOT NULL DEFAULT 0,
  saidas_operacionais   NUMERIC NOT NULL DEFAULT 0,
  saldo_final           NUMERIC NOT NULL DEFAULT 0,
  total_pagamentos      INTEGER NOT NULL DEFAULT 0,
  fechado_em            TIMESTAMPTZ,
  fechado_por           TEXT,
  reaberto_em           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_tipo, periodo_key)
);

ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fechamentos' AND policyname='fechamentos_authenticated') THEN
    CREATE POLICY "fechamentos_authenticated" ON public.fechamentos
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.fechamentos IS
  'Snapshot travado de um período de fechamento (dia/semana/mes/trimestre/semestre/ano) da página Balanço. Uma vez status=fechado, os valores não são mais recalculados a partir de pagamentos — servem de registro histórico protegido contra edição retroativa.';
