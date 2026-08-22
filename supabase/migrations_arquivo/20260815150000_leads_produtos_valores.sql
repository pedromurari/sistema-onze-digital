-- ================================================================
-- Valor de ticket configurável por produto (Psicanálise/PNL/
-- Numerologia/Outro), exibido pro vendedor em Leads Diretos.
-- Também adiciona a coluna produto em lead_aquecimento_leads, pra
-- carregar o produto do lead desde a criação da campanha de
-- aquecimento até o card em Leads Diretos.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.leads_produtos_valores (
  slug         TEXT PRIMARY KEY CHECK (slug IN ('psicanalise', 'pnl', 'numerologia', 'outro')),
  nome         TEXT NOT NULL,
  valor_ticket NUMERIC,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads_produtos_valores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_produtos_valores' AND policyname='leads_produtos_valores_authenticated') THEN
    CREATE POLICY "leads_produtos_valores_authenticated" ON public.leads_produtos_valores
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Psicanálise já tinha um ticket médio estimado calculado (fórmula fixa em
-- Pipeline.tsx, mistura PIX/cartão/boleto) -- reaproveita o mesmo valor aqui
-- como default, pra não mudar o número que já aparecia pros vendedores.
INSERT INTO public.leads_produtos_valores (slug, nome, valor_ticket) VALUES
  ('psicanalise', 'Psicanálise', 1546.63),
  ('pnl',         'PNL',         NULL),
  ('numerologia', 'Numerologia', NULL),
  ('outro',       'Outro',       NULL)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.lead_aquecimento_leads ADD COLUMN IF NOT EXISTS produto TEXT;
