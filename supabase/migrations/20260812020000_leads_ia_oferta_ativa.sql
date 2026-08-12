-- Oferta ativa (preço, parcelas, bônus) do SDR de leads, editável pelo painel
-- da Equipe Despertamente sem precisar de redeploy da function. Antes disso
-- o preço/bônus estavam hardcoded no prompt e desatualizados em relação ao
-- que o time humano realmente vende (R$250 fixo vs. R$997/parcelado real, e
-- bônus proibidos de serem mencionados apesar de serem usados ativamente
-- pelo time como argumento de fechamento).

CREATE TABLE IF NOT EXISTS public.leads_ia_oferta_ativa (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preco_avista          NUMERIC(10,2) NOT NULL,
  cartao_parcelas       INTEGER NOT NULL,
  cartao_valor_parcela  NUMERIC(10,2) NOT NULL,
  boleto_entrada        NUMERIC(10,2) NOT NULL,
  boleto_parcelas       INTEGER NOT NULL,
  boleto_valor_parcela  NUMERIC(10,2) NOT NULL,
  valor_total_bonus     NUMERIC(10,2),
  bonus                 JSONB NOT NULL DEFAULT '[]', -- [{ "nome": string, "valor": number, "limitado": string|null }]
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_ia_oferta_ativa_ativo_idx ON public.leads_ia_oferta_ativa(ativo);

ALTER TABLE public.leads_ia_oferta_ativa ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads_ia_oferta_ativa' AND policyname = 'leads_ia_oferta_ativa_authenticated') THEN
    CREATE POLICY "leads_ia_oferta_ativa_authenticated" ON public.leads_ia_oferta_ativa
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed com a oferta real que o time (Igor) vem usando ativamente por
-- WhatsApp entre 10-12/08/2026 -- valores confirmados em conversas reais,
-- não inventados. Editar aqui (ou pelo painel) quando a promoção mudar.
INSERT INTO public.leads_ia_oferta_ativa (
  preco_avista, cartao_parcelas, cartao_valor_parcela,
  boleto_entrada, boleto_parcelas, boleto_valor_parcela,
  valor_total_bonus, bonus, ativo, observacoes
) VALUES (
  997.00, 12, 109.40,
  110.00, 14, 110.00,
  2247.00,
  '[
    {"nome": "10 sessões de supervisão clínica em grupo", "valor": 1200, "limitado": null},
    {"nome": "Practitioner em PNL (Reprogramação Mental)", "valor": 790, "limitado": null},
    {"nome": "Workshop \"Cicatrizes que Curam\"", "valor": 60, "limitado": null},
    {"nome": "Workshop de Reiki — O Despertar da Energia Vital", "valor": 197, "limitado": null}
  ]'::jsonb,
  true,
  'Baseado nas mensagens reais enviadas pelo time (Igor) entre 10-12/08/2026. Atualizar aqui quando a promoção mudar.'
);
