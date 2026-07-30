-- ================================================================
-- Canais de cobrança: lista configurável (criada pelo próprio usuário em
-- Configurações) de "por onde esse pagamento foi coletado" — ex: Asaas,
-- Vega, PIX manual, Link de parceiro. Selecionado na hora de dar baixa
-- num pagamento (ficha do aluno), guardado em pagamentos.canal_cobranca.
-- Necessário porque a taxa de gateway varia por canal, e hoje não havia
-- registro de qual canal recebeu cada transação — só uma estimativa via
-- forma_pagamento do contrato.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.canais_cobranca (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL UNIQUE,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.canais_cobranca ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='canais_cobranca' AND policyname='canais_cobranca_authenticated') THEN
    CREATE POLICY "canais_cobranca_authenticated" ON public.canais_cobranca
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS canal_cobranca TEXT;

COMMENT ON COLUMN public.pagamentos.canal_cobranca IS
  'Nome do canal (public.canais_cobranca) que coletou esta transação específica — escolhido ao dar baixa. Usado para calcular a taxa exata de gateway por pagamento.';
