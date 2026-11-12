-- Ajustes pedidos pelo Pedro 12/11/2026, depois do 1º envio real:
--
-- 1) Horário: antes 20h Brasília (dia ainda correndo). Agora 00:05 Brasília,
--    com os números do DIA QUE PASSOU fechado -- "passou o dia, manda
--    referente ao dia passado".
-- 2) Leads diretos saem do CRM e passam a vir do Gestor de Tráfego (Meta
--    Ads): a campanha de anúncio manda a pessoa direto pro WhatsApp, ela
--    nunca preenche formulário, então NUNCA entrava em `leads` -- por isso o
--    1º relatório saiu "0 leads" num dia em que o Meta registrou 13
--    conversas. Quem busca a Meta é a edge function (SQL não faz HTTP), então
--    esta função passa a devolver só os dados do CRM, em JSON, e o texto é
--    montado lá.
--
-- Substitui comercial_relatorio_dia_texto() (migration 20261111190000).

drop function if exists public.comercial_relatorio_dia_texto();

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
  v_disparos json;
begin
  -- Venda "de verdade" = pagamento da 1ª parcela caiu no dia (mesma régua de
  -- data_venda_concretizada usada em time_comercial_minhas_vendas).
  select count(*) into v_vendas
  from alunos a
  where a.vendedor_id is not null
    and a.status <> 'pre_matricula'
    and exists (
      select 1 from pagamentos p
      where p.aluno_id = a.id and p.numero_parcela = 1 and p.status = 'pago'
        and p.data_pagamento = d
    );

  -- Pré-matrícula "do dia" = ficha preenchida no dia (created_at), não a data
  -- programada de cobrança futura.
  select count(*) into v_pre
  from alunos a
  where a.vendedor_id is not null
    and a.status = 'pre_matricula'
    and (a.created_at at time zone 'America/Sao_Paulo')::date = d;

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
    'disparos', v_disparos
  );
end;
$$;

revoke all on function public.comercial_relatorio_dia_dados(date) from public, anon;
grant execute on function public.comercial_relatorio_dia_dados(date) to authenticated;

select cron.unschedule('comercial-relatorio-dia') where exists (select 1 from cron.job where jobname = 'comercial-relatorio-dia');

-- 00:05 Brasília (03:05 UTC) -- logo depois do dia fechar, com 5 min de folga
-- pros últimos registros do dia caírem.
select cron.schedule('comercial-relatorio-dia', '5 3 * * *', $$
  select net.http_post(
    url := 'https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/comercial-relatorio-dia',
    body := jsonb_build_object(),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.get_comercial_relatorio_dia_cron_secret()),
    timeout_milliseconds := 55000
  );
$$);
