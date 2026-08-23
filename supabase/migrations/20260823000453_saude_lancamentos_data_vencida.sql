-- Ajuste na saude dos lancamentos, depois do dono apontar o que a versao anterior errava.
--
-- A checagem "capturando depois da live" acusava SETE lancamentos e nao servia para nada:
-- a data da live simplesmente envelhece e ninguem atualiza. O dono confirmou — "a data do
-- #44 deve ser a antiga". Acusar o sintoma sete vezes e ruido; o que importa e o fato de
-- a data estar vencida, uma vez por lancamento.
--
-- Um lancamento ATIVO com data no passado esta numa de duas situacoes, e as duas pedem
-- acao: ou a data nao foi atualizada, ou o lancamento ja acabou e deveria estar inativo.
-- Enquanto fica assim, ele continua aparecendo como candidato a receber lead — e a captura
-- sem turma informada usa exatamente `data_live` para decidir para onde mandar.

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

    -- Data vencida num lançamento ativo. Uma linha por lançamento, nao uma por sintoma.
    -- Importa porque a captura sem turma informada escolhe o destino por `data_live`.
    select b.nome, 'alto',
           'data da live vencida',
           'A data cadastrada foi ha ' || abs(b.dias) || ' dias'
             || case when b.ultima_captura > b.data_live
                     then ', e ainda entrou lead em ' || b.ultima_captura else '' end
             || '. Atualize a data ou desative o lancamento.',
           b.dias, b.leads, b.id
      from base b
     where b.dias < 0

    union all

    -- A live esta chegando e nao ha aquecimento montado. Nao da para montar 16 dias de
    -- sequencia na vespera.
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

    -- Boas-vindas pausada por erro: para de responder quem se inscreve, em silencio.
    select b.nome, 'alto',
           'boas-vindas pausada por erro',
           'A sequencia de boas-vindas se pausou sozinha e nao volta sem alguem religar',
           b.dias, b.leads, b.id
      from base b
     where b.bv_pausada

    union all

    -- Montagem comecada e nao terminada.
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
  'O que falta em cada lancamento ativo: data vencida, aquecimento sem mensagem, live chegando sem inscrito. Criado depois que #44 a #47 foram cadastradas com data e sem aquecimento, e a captura caiu de 813 leads/semana para 16 sem ninguem perceber.';

revoke execute on function public.saude_dos_lancamentos() from public, anon;
grant  execute on function public.saude_dos_lancamentos() to authenticated;
