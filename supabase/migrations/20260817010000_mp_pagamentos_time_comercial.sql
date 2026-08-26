-- Rastreio do Mercado Pago pra ficha de matrícula pública do Time Comercial
-- (/matricula/:vendedor) — pagamento embutido (PIX/boleto/cartão parcelado/
-- cartão recorrente), sem redirecionar o aluno pra fora do site. Ver
-- src/pages/MatriculaTimeComercial.tsx e a nova edge function de checkout
-- (ainda não criada nesta migration -- só o schema).

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS mp_customer_id text,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id text,  -- id da assinatura MP, só pra cartão recorrente
  ADD COLUMN IF NOT EXISTS mp_status text;          -- espelho do status mais recente vindo do webhook, pra exibir rápido no Financeiro sem juntar com pagamentos

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS mp_payment_id text;       -- id do pagamento MP que gerou/baixou essa parcela

CREATE INDEX IF NOT EXISTS idx_pagamentos_mp_payment_id ON public.pagamentos(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alunos_mp_preapproval_id ON public.alunos(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

COMMENT ON COLUMN public.alunos.mp_preapproval_id IS 'ID da assinatura (preapproval) no Mercado Pago -- só preenchido quando forma_pagamento é cartão recorrente.';
COMMENT ON COLUMN public.pagamentos.mp_payment_id IS 'ID do pagamento no Mercado Pago que confirmou/gerou essa parcela -- usado pelo webhook pra casar o evento com a linha certa.';
