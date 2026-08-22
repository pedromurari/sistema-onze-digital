-- Balanço da empresa: entradas, saídas, custos fixos/variáveis por produto
CREATE TABLE IF NOT EXISTS public.balanco_itens (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao     text    NOT NULL,
  valor         numeric NOT NULL CHECK (valor > 0),
  tipo          text    NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria     text    NOT NULL CHECK (categoria IN (
                  'matricula', 'outro_entrada',
                  'custo_fixo', 'custo_variavel', 'ads', 'outro_saida'
                )),
  produto       text    NOT NULL DEFAULT 'geral' CHECK (produto IN ('npa', 'psicanalise', 'geral')),
  mes_referencia text   NOT NULL,  -- formato 'YYYY-MM'
  recorrente    boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT timezone('utc', now())
);

ALTER TABLE public.balanco_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balanco_all_authenticated"
  ON public.balanco_itens FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_balanco_mes ON public.balanco_itens (mes_referencia);
CREATE INDEX IF NOT EXISTS idx_balanco_produto ON public.balanco_itens (produto);
