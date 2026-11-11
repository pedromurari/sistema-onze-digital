-- Relatório automático de fim de dia do Time Comercial pro grupo "DP -
-- Comercial" (pedido do Pedro 11/11/2026, mesmo padrão do financeiro):
-- leads diretos do dia (canal='Direto' dentro de Time Comercial -- exclui
-- SDD e Lançamento/curso gratuito, que são canais diferentes), vendas e
-- pré-matrículas fechadas no dia, e quantos envios saíram hoje de cada
-- campanha de disparo em massa ativa. Segue o mesmo padrão de cron-secret
-- de ceo_relatorio_financeiro_grupo/aulas-aviso-meet.
--
-- "Leads diretos" hoje em dia é só canal='Direto' (origem='Time Comercial')
-- -- o pool antigo origem='Direto' + lead_direto_eventos (site) está parado
-- desde 14/08/2026, sem lead novo; não existe um canal "Site" separado no
-- sistema atual, então não dá pra quebrar WhatsApp vs site (confirmado com
-- o Pedro 11/11/2026: contar tudo junto como "leads diretos").

create or replace function public.comercial_relatorio_dia_texto()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_leads_direto int := 0;
  v_vendas int := 0;
  v_pre int := 0;
  v_disparos text := '';
  v_texto text;
  r record;
begin
  select count(*) into v_leads_direto
  from leads
  where origem = 'Time Comercial' and canal = 'Direto'
    and (criado_em at time zone 'America/Sao_Paulo')::date = hoje;

  -- Venda "de verdade" = pagamento da 1ª parcela caiu hoje (mesma régua de
  -- data_venda_concretizada usada em time_comercial_minhas_vendas) --
  -- independe de quando a ficha foi preenchida.
  select count(*) into v_vendas
  from alunos a
  where a.vendedor_id is not null
    and a.status <> 'pre_matricula'
    and exists (
      select 1 from pagamentos p
      where p.aluno_id = a.id and p.numero_parcela = 1 and p.status = 'pago'
        and p.data_pagamento = hoje
    );

  -- Pré-matrícula "de hoje" = ficha preenchida hoje (created_at), não a
  -- data programada de cobrança futura.
  select count(*) into v_pre
  from alunos a
  where a.vendedor_id is not null
    and a.status = 'pre_matricula'
    and (a.created_at at time zone 'America/Sao_Paulo')::date = hoje;

  for r in (
    select cm.nome, count(*) as enviados
    from disparo_leads dl
    join disparo_campanhas dc on dc.id = dl.campanha_id
    join campanhas_massa cm on cm.disparo_campanha_id = dc.id
    where dl.status = 'enviado'
      and (dl.sent_at at time zone 'America/Sao_Paulo')::date = hoje
      and cm.status in ('enviando', 'pronta')
    group by cm.nome
    order by cm.nome
  ) loop
    v_disparos := v_disparos || E'\n• ' || r.nome || ': ' || r.enviados || ' enviado(s)';
  end loop;
  if v_disparos = '' then
    v_disparos := E'\nNenhum disparo de campanha hoje.';
  end if;

  v_texto :=
    '📊 *Comercial — ' || to_char(hoje, 'DD/MM') || '*' || E'\n\n' ||
    'Leads diretos hoje: ' || v_leads_direto || E'\n' ||
    'Vendas fechadas hoje: ' || v_vendas || E'\n' ||
    'Pré-matrículas hoje: ' || v_pre || E'\n\n' ||
    '*Disparos de hoje:*' || v_disparos;

  return v_texto;
end;
$$;

revoke all on function public.comercial_relatorio_dia_texto() from public, anon;
grant execute on function public.comercial_relatorio_dia_texto() to authenticated;

insert into public.cron_segredos_internos (nome, valor)
values ('comercial_relatorio_dia', encode(gen_random_bytes(24), 'hex'))
on conflict (nome) do nothing;

create or replace function public.get_comercial_relatorio_dia_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select valor from public.cron_segredos_internos where nome = 'comercial_relatorio_dia';
$$;
revoke all on function public.get_comercial_relatorio_dia_cron_secret() from public, anon, authenticated;

select cron.unschedule('comercial-relatorio-dia') where exists (select 1 from cron.job where jobname = 'comercial-relatorio-dia');

-- Diário às 20:00 Brasília (23:00 UTC) -- mesmo horário do financeiro.
select cron.schedule('comercial-relatorio-dia', '0 23 * * *', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/comercial-relatorio-dia',
    body := jsonb_build_object(),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_comercial_relatorio_dia_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);
