-- Asaas para alunos NOVOS (decisão do dono do produto, 2026-09-08):
--   "os alunos atuais irão continuar na voomp.. apenas os novos irão para o asaas"
--
-- A geração de boleto Asaas passa a cobrir alunos novos de qualquer origem
-- (hoje só `time_comercial`), travada por `data_matricula >= inicio_operacao_fiscal`
-- -- então NÃO tem como tocar nos ~136 alunos atuais.
--
-- A parcela da extensão universitária (Anhanguera) é paga pela EMPRESA na Voomp,
-- por fora. O sistema só a marca (`conta_recebimento = 'voomp'`) e não gera
-- boleto Asaas pra ela.
--
-- Nada muda até `asaas_novos_ativo` virar true. Aditiva, dois campos.

alter table public.balanco_config
  add column if not exists asaas_novos_ativo      boolean  not null default false,
  add column if not exists parcela_voomp_extensao smallint not null default 2;

comment on column public.balanco_config.asaas_novos_ativo is
  'Trava. Quando true, matricula-boleto-mensal-gerar gera boleto Asaas para alunos novos (data_matricula >= inicio_operacao_fiscal) de qualquer origem, nao so time_comercial. Comeca false.';
comment on column public.balanco_config.parcela_voomp_extensao is
  'Numero da parcela paga pela empresa na Voomp (vinculo extensao Anhanguera). Essa parcela nao gera boleto Asaas -- so recebe conta_recebimento = voomp.';
