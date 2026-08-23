-- Terceira e ultima calibragem da saude dos lancamentos.
--
-- A versao anterior acusava "data da live vencida" em SEIS lancamentos (#38 a #43). Mas um
-- lancamento que aconteceu e parou de captar nao e um problema — e um lancamento
-- terminado. Acusa-lo para sempre e exatamente o ruido que faz ninguem ler a lista.
--
-- O que realmente doi e o lancamento que continua RECEBENDO depois da live: a pessoa se
-- inscreve para um evento que ja passou. Hoje isso e so a #44, que recebeu lead hoje para
-- uma live de 11/08.
--
-- Regra: data vencida so vira alerta se ainda entrou lead nos ultimos 14 dias.

create or replace function public.saude_dos_lancamentos()
returns table (
  lancamento    text,
  gravidade     text,
  problema      text,
  efeito        text,
  dias_ate_live integer,
  leads         integer,
  referencia    uuid
)
language sql
security definer
stable
set search_path to 'public', 'pg_temp'
as $fn$
  with base as (
    select l.id, l.nome, l.data_live,
           (l.data_live - current_date)::integer as dias,
           (select count(*)::integer from public.lancamento_leads ll
             where ll.lancamento_id = l.id) as leads,
           (select max(ll.created_at)::date from public.lancamento_leads ll
             where ll.lancamento_id = l.id) as ultima_captura,
           exists (select 1 from public.funnel_configs f where f.funnel_name = l.nome) as tem_config,
           (select count(*)::integer from public.funnel_messages m
             where m.funnel_name = l.nome) as mensagens,
           (select bv.pausado_por_erro from public.boas_vindas_config bv
             where bv.funnel_name = l.nome) as bv_pausada
      from public.lancamentos l
     where l.ativo
  )
  select * from (

    -- Ainda recebendo depois da live: a pessoa se inscreve para um evento que ja passou.
    -- So conta se entrou lead nos ultimos 14 dias — lancamento terminado nao e problema.
    select b.nome, 'alto',
           'recebendo lead depois da live',
           'A data cadastrada foi ha ' || abs(b.dias) || ' dias e ainda entrou lead em '
             || b.ultima_captura || '. Atualize a data ou tire a pagina do ar.',
           b.dias, b.leads, b.id
      from base b
     where b.dias < 0
       and b.ultima_captura > b.data_live
       and b.ultima_captura >= current_date - 14

    union all

    -- A live esta chegando e nao ha aquecimento montado.
    select b.nome, 'alto',
           'live chegando e sem aquecimento',
           'A live e em ' || b.dias || ' dia(s) e nao ha mensagem de aquecimento montada',
           b.dias, b.leads, b.id
      from base b
     where b.dias between 0 and 14 and b.mensagens = 0

    union all

    -- Ja captou gente que nao recebe nada. Foi o caso da #42, com 646 leads.
    select b.nome, 'alto',
           'tem lead e nenhum aquecimento',
           b.leads || ' pessoas se inscreveram e nao ha sequencia para trabalha-las',
           b.dias, b.leads, b.id
      from base b
     where b.leads > 0 and b.mensagens = 0

    union all

    -- Live proxima sem ninguem inscrito: ou a pagina nao subiu, ou aponta para outro lugar.
    select b.nome, 'alto',
           'live chegando e sem inscrito',
           'A live e em ' || b.dias || ' dia(s) e nao ha nenhum lead capturado',
           b.dias, b.leads, b.id
      from base b
     where b.dias between 0 and 14 and b.leads = 0

    union all

    select b.nome, 'alto',
           'boas-vindas pausada por erro',
           'A sequencia de boas-vindas se pausou sozinha e nao volta sem alguem religar',
           b.dias, b.leads, b.id
      from base b
     where b.bv_pausada

    union all

    select b.nome, 'medio',
           'aquecimento montado pela metade',
           'Existe configuracao de funil mas nenhuma mensagem cadastrada',
           b.dias, b.leads, b.id
      from base b
     where b.tem_config and b.mensagens = 0

  ) achados
   where public.tem_permissao('lancamentos', 'ver');
$fn$;

comment on function public.saude_dos_lancamentos() is
  'O que falta em cada lancamento ativo. Calibrada tres vezes para nao gritar a toa: lancamento terminado nao aparece, so o que ainda causa dano. Criada depois que #44 a #47 foram cadastradas com data e sem aquecimento, e a captura caiu de 813 leads/semana para 16 sem ninguem perceber.';

revoke execute on function public.saude_dos_lancamentos() from public, anon;
grant  execute on function public.saude_dos_lancamentos() to authenticated;
