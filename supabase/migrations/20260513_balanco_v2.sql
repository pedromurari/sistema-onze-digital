-- Adiciona campo retorno_realizado para calcular ROI de ads/marketing
ALTER TABLE public.balanco_itens
  ADD COLUMN IF NOT EXISTS retorno_realizado NUMERIC DEFAULT 0;

-- Expande o CHECK de categoria para incluir 'alocacao'
ALTER TABLE public.balanco_itens
  DROP CONSTRAINT IF EXISTS balanco_itens_categoria_check;

ALTER TABLE public.balanco_itens
  ADD CONSTRAINT balanco_itens_categoria_check
  CHECK (categoria IN (
    'matricula', 'outro_entrada',
    'custo_fixo', 'custo_variavel', 'ads', 'alocacao', 'outro_saida'
  ));

-- Configurações globais do balanço (taxas financeiras + repartição de sócios)
CREATE TABLE IF NOT EXISTS public.balanco_config (
  id        TEXT PRIMARY KEY DEFAULT 'default',
  taxas     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{nome, percentual}]
  socios    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{nome, percentual}]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.balanco_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balanco_config_all_authenticated" ON public.balanco_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
