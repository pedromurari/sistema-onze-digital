-- O que esta faltando em cada lancamento, sem ninguem precisar procurar.
--
-- ── O QUE ISTO RESOLVE ──────────────────────────────────────────────────────
-- As turmas #44 a #47 foram criadas com data em 22/07, com meses de antecedencia. Nenhuma
-- ganhou funil. Ninguem foi avisado. O resultado, medido em 22/08:
--
--   semana 20/07 ....... 813 leads capturados
--   semana 27/07 ....... 503
--   semana 03/08 ....... 198
--   semana 10/08 .........  0
--   semana 17/08 ......... 16
--
-- A captura caiu 98% e o sistema nao tinha onde mostrar isso. Pior: a Turma #42 tem 646
-- leads e ZERO mensagens de funil — uma turma inteira que nao recebeu sequencia nenhuma.
--
-- Criar um lancamento e preencher a data nao gera sinal nenhum de que ele esta pela
-- metade. E a mesma familia dos bugs do financeiro: ausencia lida como normalidade.
--
-- Mesmo desenho da `integridade_financeira`: funcao SECURITY DEFINER com portao explicito.
-- As checagens sao `not exists`, e sob a RLS de quem consulta a falta de permissao viraria
-- falso positivo.

create or replace function public.saude_dos_lancamentos()
returns table (
  lancamento   text,
  gravidade    text,
  problema     text,
  efeito       text,
  dias_ate_live integer,
  leads        integer,
  referencia   uuid
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
           exists (select 1 from public.funnel_configs f  where f.funnel_name = l.nome) as tem_config,
           (select count(*)::integer from public.funnel_messages m
             where m.funnel_name = l.nome) as mensagens,
           (select bv.wpp_ativo from public.boas_vindas_config bv
             where bv.funnel_name = l.nome) as bv_wpp,
           (select bv.pausado_por_erro from public.boas_vindas_config bv
             where bv.funnel_name = l.nome) as bv_pausada
      from public.lancamentos l
     where l.ativo
  )
  select * from (

    -- A live esta chegando e nao ha funil montado. O mais caro: nao da para montar
    -- 16 dias de sequencia na vespera.
    select b.nome, 'alto',
           'live chegando e sem funil',
           'A live e em ' || b.dias || ' dia(s) e nao ha nenhuma mensagem de funil montada',
           b.dias, b.leads, b.id
      from base b
     where b.dias between 0 and 14 and b.mensagens = 0

    union all

    -- Ja captou gente e essas pessoas nao recebem nada. Foi o caso da #42, com 646 leads.
    select b.nome, 'alto',
           'tem lead e nenhuma mensagem',
           b.leads || ' pessoas se inscreveram e nao ha funil para trabalha-las',
           b.dias, b.leads, b.id
      from base b
     where b.leads > 0 and b.mensagens = 0

    union all

    -- Live proxima sem ninguem inscrito: ou a pagina de captura nao subiu, ou nao esta
    -- apontando para este lancamento.
    select b.nome, 'alto',
           'live chegando e sem inscrito',
           'A live e em ' || b.dias || ' dia(s) e nao ha nenhum lead capturado',
           b.dias, b.leads, b.id
      from base b
     where b.dias between 0 and 14 and b.leads = 0

    union all

    -- A live passou e o lancamento continua capturando: as pessoas estao se inscrevendo
    -- para um evento que ja aconteceu.
    select b.nome, 'medio',
           'capturando depois da live',
           'A live foi ha ' || abs(b.dias) || ' dias e ainda entrou lead em ' || b.ultima_captura,
           b.dias, b.leads, b.id
      from base b
     where b.dias < 0 and b.ultima_captura > b.data_live

    union all

    -- Boas-vindas pausada por erro: para de responder quem se inscreve, em silencio.
    select b.nome, 'alto',
           'boas-vindas pausada por erro',
           'A sequencia de boas-vindas se pausou sozinha e nao volta sem alguem religar',
           b.dias, b.leads, b.id
      from base b
     where b.bv_pausada

    union all

    -- Config de funil sem mensagem nenhuma: montagem comecada e nao terminada.
    select b.nome, 'medio',
           'funil montado pela metade',
           'Existe configuracao de funil mas nenhuma mensagem foi cadastrada',
           b.dias, b.leads, b.id
      from base b
     where b.tem_config and b.mensagens = 0

  ) achados
   where public.tem_permissao('lancamentos', 'ver');
$fn$;

comment on function public.saude_dos_lancamentos() is
  'O que falta em cada lancamento ativo: funil sem mensagem, live chegando sem inscrito, captura depois da live. Criado depois que #44 a #47 foram cadastradas com data e sem funil, e a captura caiu de 813 leads/semana para 16 sem ninguem perceber.';

revoke execute on function public.saude_dos_lancamentos() from public, anon;
grant  execute on function public.saude_dos_lancamentos() to authenticated;
