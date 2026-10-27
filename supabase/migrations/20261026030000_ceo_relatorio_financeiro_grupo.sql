-- Relatório automático de Financeiro pro grupo "DP - Financeiro" (pedido do
-- Pedro 26/10/2026): diário no final do dia, semanal no início da semana
-- (relação da semana passada), mensal no início do mês (relação do mês
-- passado). Segue o mesmo padrão de cron-secret de aulas-aviso-meet.

create or replace function public.ceo_relatorio_financeiro_texto(p_periodo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_fim date;
  v_label text;
  v_faturamento numeric := 0;
  v_vendas int := 0;
  v_inadimplentes int := 0;
  v_inadimplencia_valor numeric := 0;
  v_texto text;
begin
  if p_periodo = 'diario' then
    v_inicio := hoje; v_fim := hoje;
    v_label := 'Relatório do dia (' || to_char(hoje, 'DD/MM') || ')';
  elsif p_periodo = 'semanal' then
    v_inicio := hoje - 7; v_fim := hoje - 1;
    v_label := 'Relatório da semana passada (' || to_char(v_inicio,'DD/MM') || ' a ' || to_char(v_fim,'DD/MM') || ')';
  elsif p_periodo = 'mensal' then
    v_inicio := (date_trunc('month', hoje) - interval '1 month')::date;
    v_fim := (date_trunc('month', hoje) - interval '1 day')::date;
    v_label := 'Relatório do mês passado (' || to_char(v_inicio,'MM/YYYY') || ')';
  else
    raise exception 'periodo inválido: %', p_periodo;
  end if;

  select coalesce(sum(valor), 0) into v_faturamento
  from pagamentos
  where status = 'pago' and data_pagamento between v_inicio and v_fim;

  select count(distinct id) into v_vendas
  from alunos
  where data_matricula between v_inicio and v_fim;

  -- Inadimplência é sempre a foto de hoje (não dá pra "inadimplência da
  -- semana passada" retroativa) -- mesma regra canônica da Diretoria
  -- Financeiro: atrasado literal OU pendente com vencimento já passado,
  -- só de aluno ativo.
  select count(*), coalesce(sum(p.valor), 0) into v_inadimplentes, v_inadimplencia_valor
  from pagamentos p
  join alunos a on a.id = p.aluno_id and a.status = 'ativo'
  where p.status = 'atrasado' or (p.status = 'pendente' and p.data_vencimento < hoje);

  v_texto :=
    '📊 *' || v_label || '*' || E'\n\n' ||
    '💰 Faturamento: R$ ' || to_char(v_faturamento, 'FM999G999G990D00') || E'\n' ||
    '🧾 Novas matrículas: ' || v_vendas || E'\n' ||
    '⚠️ Inadimplência (hoje): ' || v_inadimplentes || ' parcela(s) · R$ ' || to_char(v_inadimplencia_valor, 'FM999G999G990D00');

  return v_texto;
end;
$$;

revoke all on function public.ceo_relatorio_financeiro_texto(text) from public, anon;
grant execute on function public.ceo_relatorio_financeiro_texto(text) to authenticated;

insert into public.cron_segredos_internos (nome, valor)
values ('ceo_relatorio_financeiro', encode(gen_random_bytes(24), 'hex'))
on conflict (nome) do nothing;

create or replace function public.get_ceo_relatorio_financeiro_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select valor from public.cron_segredos_internos where nome = 'ceo_relatorio_financeiro';
$$;
revoke all on function public.get_ceo_relatorio_financeiro_cron_secret() from public, anon, authenticated;

select cron.unschedule('ceo-relatorio-financeiro-diario') where exists (select 1 from cron.job where jobname = 'ceo-relatorio-financeiro-diario');
select cron.unschedule('ceo-relatorio-financeiro-semanal') where exists (select 1 from cron.job where jobname = 'ceo-relatorio-financeiro-semanal');
select cron.unschedule('ceo-relatorio-financeiro-mensal') where exists (select 1 from cron.job where jobname = 'ceo-relatorio-financeiro-mensal');

-- Diário às 20:00 Brasília (23:00 UTC)
select cron.schedule('ceo-relatorio-financeiro-diario', '0 23 * * *', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/ceo-relatorio-financeiro',
    body := jsonb_build_object('periodo', 'diario'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_ceo_relatorio_financeiro_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);

-- Semanal, segunda 08:00 Brasília (11:00 UTC)
select cron.schedule('ceo-relatorio-financeiro-semanal', '0 11 * * 1', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/ceo-relatorio-financeiro',
    body := jsonb_build_object('periodo', 'semanal'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_ceo_relatorio_financeiro_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);

-- Mensal, dia 1 às 08:00 Brasília (11:00 UTC)
select cron.schedule('ceo-relatorio-financeiro-mensal', '0 11 1 * *', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/ceo-relatorio-financeiro',
    body := jsonb_build_object('periodo', 'mensal'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_ceo_relatorio_financeiro_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);
