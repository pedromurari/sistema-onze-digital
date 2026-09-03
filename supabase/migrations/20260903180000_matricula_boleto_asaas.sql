-- Suporte a Asaas para o boleto recorrente (15x) da ficha de matrícula do
-- Time Comercial (/matricula/:vendedor). Troca a geração das parcelas 2-15
-- de Mercado Pago (bolbradesco) para Asaas -- ver
-- supabase/functions/matricula-boleto-mensal-gerar (reescrita nesta mesma
-- tarefa) e supabase/functions/asaas-webhook-time-comercial (novo).
--
-- Colunas antigas (mp_payment_id/link_pagamento_mp em pagamentos) e o
-- histórico da 1ª parcela via PIX-MP não mudam -- só as parcelas 2-15
-- passam a usar as colunas novas abaixo.

alter table public.alunos
  add column if not exists asaas_customer_id text;

alter table public.pagamentos
  add column if not exists asaas_payment_id text,
  add column if not exists link_pagamento_asaas text;

comment on column public.alunos.asaas_customer_id is
  'ID do cliente no Asaas (customer), criado na 1ª geração de boleto do plano Time Comercial.';
comment on column public.pagamentos.asaas_payment_id is
  'ID da cobrança (payment) no Asaas -- parcelas 2-15 do boleto Time Comercial. Ver matricula-boleto-mensal-gerar.';
comment on column public.pagamentos.link_pagamento_asaas is
  'Link do boleto (bankSlipUrl) no Asaas -- usado por get_alunos_para_cobranca/enviar-cobranca.';
