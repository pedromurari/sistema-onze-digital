-- O saldo inicial é a âncora manual da futura conciliação por conta. Ele fica em JSONB
-- porque as contas formam uma configuração pequena e versionada no código; criar uma
-- linha por conta agora adicionaria complexidade sem histórico de movimentações ainda.
-- Esta migration é deliberadamente aditiva e NÃO contém backfill: os valores reais e a
-- data-base serão informados pelo Pedro no formulário depois da revisão do financeiro.

alter table public.balanco_config
  add column if not exists saldo_inicial_contas jsonb not null default '{}';

comment on column public.balanco_config.saldo_inicial_contas is
  'Saldo inicial manual por conta e data-base: {data, inter, c6, mercado_pago, asaas, voomp}.';
