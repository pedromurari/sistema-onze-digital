-- Fase 1.2 da estruturação do financeiro (ver artifact "Manual do Financeiro").
--
-- Cada lançamento -- parcela (pagamentos) e despesa (balanco_itens) -- passa a
-- carregar os eixos que o DRE e a contabilidade exigem: competência, caixa,
-- categoria contábil, conta/gateway; e a parcela ganha controle de nota fiscal.
-- Tudo aditivo, com backfill conservador. Nenhuma coluna é removida.
--
-- Contas (recebimento e pagamento):
--   inter        = conta do Pedro (repasse da parte dele; quase nada cai direto)
--   c6           = conta ligada à parte do Rodrygo; onde cai a maior parte hoje
--   mercado_pago = cartão / maquininha / link de pagamento / ingresso (Vega)
--   asaas        = recorrência (NPS/PSI) e, daqui pra frente, todas as parcelas
--   voomp        = plataforma da parceria Anhanguera (1-2 parcelas por aluno,
--                  pra vincular a extensão universitária e liberar o acesso)
--   outro        = Hotmart, conta PF, qualquer outro

-- ─────────────────────────────────────────────────────────────────────────────
-- pagamentos
-- ─────────────────────────────────────────────────────────────────────────────
-- Datas: NÃO cria coluna nova. mes_referencia (date) = competência,
-- data_pagamento (date) = caixa. Já existem; a Fase 1.5 garante o preenchimento.

alter table public.pagamentos
  add column if not exists conta_recebimento text,
  add column if not exists forma_pagamento   text,
  add column if not exists categoria_contabil text not null default 'receita_curso',
  add column if not exists nf_status         text not null default 'nao_emitida',
  add column if not exists nf_numero         text,
  add column if not exists nf_link           text,
  add column if not exists nf_emitida_em     timestamptz;

alter table public.pagamentos
  drop constraint if exists pagamentos_conta_recebimento_check,
  add  constraint pagamentos_conta_recebimento_check
    check (conta_recebimento is null or conta_recebimento in
      ('inter','c6','mercado_pago','asaas','voomp','outro'));

alter table public.pagamentos
  drop constraint if exists pagamentos_nf_status_check,
  add  constraint pagamentos_nf_status_check
    check (nf_status in ('nao_emitida','emitida','dispensada','erro'));

comment on column public.pagamentos.conta_recebimento is
  'Conta/gateway que recebeu esta parcela -- base da conciliação de caixa.';
comment on column public.pagamentos.forma_pagamento is
  'Forma de pagamento DESTA parcela (pode diferir de alunos.forma_pagamento, que é a corrente).';
comment on column public.pagamentos.categoria_contabil is
  'Linha do plano de contas gerencial. Parcela de curso = receita_curso por padrão.';
comment on column public.pagamentos.nf_status is
  'Controle de NFS-e da parcela: nao_emitida | emitida | dispensada | erro.';

-- pagamentos.produto: o CHECK antigo só aceitava psicanalise/numerologia, o que
-- barra parcela de PNL/NPA/Workshop. Removido -- a lista real de produtos mora
-- em public.produtos (a coluna segue sendo texto livre, usada de forma frouxa
-- pelo app; um CHECK aqui é frágil demais pra manter).
alter table public.pagamentos drop constraint if exists pagamentos_produto_check;

-- Backfill: forma da parcela herda a forma corrente do aluno (ponto de partida).
update public.pagamentos p
   set forma_pagamento = a.forma_pagamento
  from public.alunos a
 where a.id = p.aluno_id
   and p.forma_pagamento is null
   and a.forma_pagamento is not null;

-- Backfill: conta inferida do id do gateway já gravado. Sem id, fica null --
-- a conta é preenchida na conciliação, não chutada.
update public.pagamentos
   set conta_recebimento = case
     when asaas_payment_id is not null then 'asaas'
     when mp_payment_id    is not null then 'mercado_pago'
   end
 where conta_recebimento is null
   and (asaas_payment_id is not null or mp_payment_id is not null);

-- Fila de emissão de NFS-e: parcela paga e ainda sem nota.
create index if not exists idx_pagamentos_nf_pendente
  on public.pagamentos (data_pagamento)
  where status = 'pago' and nf_status = 'nao_emitida';

-- Conciliação: parcelas por conta e data de caixa.
create index if not exists idx_pagamentos_conta_data
  on public.pagamentos (conta_recebimento, data_pagamento);

-- ─────────────────────────────────────────────────────────────────────────────
-- balanco_itens (despesas / lançamentos manuais)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.balanco_itens
  add column if not exists conta_pagamento  text,
  add column if not exists data_competencia date,
  add column if not exists data_caixa       date,
  add column if not exists fornecedor       text,
  add column if not exists comprovante_url  text;

alter table public.balanco_itens
  drop constraint if exists balanco_itens_conta_pagamento_check,
  add  constraint balanco_itens_conta_pagamento_check
    check (conta_pagamento is null or conta_pagamento in
      ('inter','c6','mercado_pago','asaas','voomp','outro'));

comment on column public.balanco_itens.conta_pagamento is
  'Conta de onde saiu o pagamento desta despesa.';
comment on column public.balanco_itens.data_competencia is
  'Mês de competência da despesa (regime de competência do DRE).';
comment on column public.balanco_itens.data_caixa is
  'Data em que o dinheiro efetivamente saiu (regime de caixa).';
comment on column public.balanco_itens.fornecedor is
  'Nome do fornecedor / prestador.';
comment on column public.balanco_itens.comprovante_url is
  'Link do comprovante (nota de entrada, recibo) -- exigido no pacote mensal da contabilidade.';

-- Backfill: data_competencia derivada do mes_referencia texto ('YYYY-MM' ou 'YYYY-MM-DD').
update public.balanco_itens
   set data_competencia = case
     when mes_referencia ~ '^\d{4}-\d{2}$'       then to_date(mes_referencia || '-01', 'YYYY-MM-DD')
     when mes_referencia ~ '^\d{4}-\d{2}-\d{2}$' then to_date(mes_referencia,          'YYYY-MM-DD')
   end
 where data_competencia is null;

-- categoria: plano de contas v1. Mantém os 7 valores legados válidos (só
-- 'custo_fixo' existe em dados hoje) e acrescenta as linhas do DRE.
alter table public.balanco_itens drop constraint if exists balanco_itens_categoria_check;
alter table public.balanco_itens add constraint balanco_itens_categoria_check
  check (categoria in (
    -- entradas
    'receita_curso','matricula','receita_outra',
    -- deduções
    'imposto','taxa_gateway','estorno',
    -- custos diretos
    'comissao','repasse_investidor','custo_produto',
    -- despesas fixas
    'pro_labore','folha','software','contabilidade','ads','adm',
    -- não operacional
    'financeiro','investimento','distribuicao_lucro',
    -- legado
    'custo_fixo','custo_variavel','alocacao','outro_entrada','outro_saida'
  ));

-- produto: mesma razão de pagamentos.produto -- CHECK fixo ('npa','psicanalise',
-- 'geral') barra os demais produtos. Removido.
alter table public.balanco_itens drop constraint if exists balanco_itens_produto_check;
