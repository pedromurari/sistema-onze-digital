-- Separar balanço entre Onze Digital e IDM
ALTER TABLE public.balanco_itens
  ADD COLUMN IF NOT EXISTS empresa text NOT NULL DEFAULT 'onze_digital';

CREATE INDEX IF NOT EXISTS idx_balanco_empresa ON public.balanco_itens (empresa);

-- Config separada por empresa
INSERT INTO public.balanco_config (id, taxas, socios)
VALUES ('onze_digital', '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.balanco_config (id, taxas, socios)
VALUES ('idm', '[]'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
