-- Materiais de apoio e datas importantes por produto, consultáveis pelo
-- vendedor ao clicar no badge do produto no card do lead. Guardado como
-- jsonb (mesmo padrão de aquecimento_config.rampa) -- lista curta, sem
-- necessidade de tabela relacional própria.

ALTER TABLE public.leads_produtos_valores
  ADD COLUMN IF NOT EXISTS materiais JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS datas_importantes JSONB NOT NULL DEFAULT '[]'::jsonb;
