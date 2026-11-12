-- Pedido do Pedro 12/11/2026: o relatório de fim de dia do comercial
-- precisa considerar TODAS as origens de lead direto -- WhatsApp (já vem
-- do Meta, edge function), site (mecanismo antigo origem='Direto', hoje
-- parado desde 14/08 mas incluído por completude/futuro) e webinário
-- (canal='Webinário' em Time Comercial, já alimentado de verdade).
--
-- Substitui comercial_relatorio_dia_dados() (migration 20261112140000).

create or replace function public.comercial_relatorio_dia_dados(p_data date default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := coalesce(p_data, ((now() at time zone 'America/Sao_Paulo')::date - 1));
  v_vendas int := 0;
  v_pre int := 0;
  v_leads_site int := 0;
  v_leads_webinario int := 0;
  v_disparos json;
begin
  select count(*) into v_vendas
  from alunos a
  where a.vendedor_id is not null
    and a.status <> 'pre_matricula'
    and exists (
      select 1 from pagamentos p
      where p.aluno_id = a.id and p.numero_parcela = 1 and p.status = 'pago'
        and p.data_pagamento = d
    );

  select count(*) into v_pre
  from alunos a
  where a.vendedor_id is not null
    and a.status = 'pre_matricula'
    and (a.created_at at time zone 'America/Sao_Paulo')::date = d;

  -- Lead direto via SITE (mecanismo antigo, origem='Direto' -- parado desde
  -- 14/08/2026, mas incluído pra não ficar fora se/quando voltar a rodar).
  select count(*) into v_leads_site
  from leads
  where origem = 'Direto'
    and (criado_em at time zone 'America/Sao_Paulo')::date = d;

  -- Lead do canal Webinário (Time Comercial) -- já ativo de verdade.
  select count(*) into v_leads_webinario
  from leads
  where origem = 'Time Comercial' and canal = 'Webinário'
    and (criado_em at time zone 'America/Sao_Paulo')::date = d;

  select coalesce(json_agg(json_build_object('nome', nome, 'enviados', enviados) order by nome), '[]'::json)
    into v_disparos
  from (
    select cm.nome, count(*) as enviados
    from disparo_leads dl
    join disparo_campanhas dc on dc.id = dl.campanha_id
    join campanhas_massa cm on cm.disparo_campanha_id = dc.id
    where dl.status = 'enviado'
      and (dl.sent_at at time zone 'America/Sao_Paulo')::date = d
      and cm.status in ('enviando', 'pronta')
    group by cm.nome
  ) t;

  return json_build_object(
    'data', d,
    'vendas', v_vendas,
    'pre_matriculas', v_pre,
    'leads_site', v_leads_site,
    'leads_webinario', v_leads_webinario,
    'disparos', v_disparos
  );
end;
$$;

revoke all on function public.comercial_relatorio_dia_dados(date) from public, anon;
grant execute on function public.comercial_relatorio_dia_dados(date) to authenticated;
