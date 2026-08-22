-- Fecha um buraco que EU abri, e conserta a causa para nao reabrir.
--
-- ── O BURACO ────────────────────────────────────────────────────────────────
-- O Supabase concede EXECUTE a `anon`, `authenticated` e `service_role` por padrao em
-- toda funcao criada no schema `public`. A migration `funcoes_revoga_anon_e_search_path`
-- limpou as funcoes que existiam NAQUELE momento — e as ~25 criadas depois nasceram
-- abertas de novo, entre elas as minhas.
--
-- O pior caso, confirmado no ACL (`anon=X/postgres`):
--
--     POST /rest/v1/rpc/aplicar_camada_multi
--     { "p_tabela": "pagamentos", "p_recursos": ["qualquer_coisa"] }
--
-- `aplicar_camada_multi` e SECURITY DEFINER e faz DDL: derruba todas as policies da tabela
-- e cria outras. Com a chave anonima — que esta no bundle do site, publica por natureza —
-- daria para reescrever a seguranca de qualquer tabela do sistema.
--
-- Junto vinham `gerar_mensalidades_para` (cria parcelas) e `resolver_pessoa` (escreve em
-- pessoas), alem das funcoes de leitura de permissao.
--
-- Funcao de GATILHO nao entra na conta: retorna `trigger` e o PostgREST nao a expoe como
-- RPC. O risco esta nas que sao chamaveis.
--
-- ── O QUE O PUBLICO PRECISA DE VERDADE ──────────────────────────────────────
-- Tres funcoes, todas do portal do aluno, todas conferidas no codigo:
--   portal_aluno_por_token      -> src/pages/AreaMembros.tsx
--   portal_pagamentos_por_token -> src/pages/AreaMembros.tsx
--   portal_contrato_por_token   -> src/pages/ContratoPublico.tsx, FormularioAluno.tsx
-- Elas recebem um token uuid e so devolvem o registro daquele token.

do $$
declare f record; fechadas int := 0;
begin
  for f in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t     on t.oid = p.prorettype
     where n.nspname = 'public'
       and t.typname <> 'trigger'                        -- gatilho nao e chamavel por RPC
       and p.proname not in ('portal_aluno_por_token',
                             'portal_pagamentos_por_token',
                             'portal_contrato_por_token')
       and p.prokind = 'f'
       -- extensoes (pg_trgm etc.) tem dona propria e nao sao nossas para mexer
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function public.%I(%s) from anon, public',
                   f.proname, f.args);
    fechadas := fechadas + 1;
  end loop;
  raise notice 'funcoes fechadas para anon: %', fechadas;
end $$;

-- ── A CAUSA: o padrao do schema ─────────────────────────────────────────────
-- Sem isto, a proxima funcao que eu criar nasce aberta outra vez — foi exatamente o que
-- aconteceu. Agora funcao nova nasce SEM execute para anon; quem precisar de acesso
-- publico recebe um grant explicito, que e uma decisao visivel na migration.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- As tres do portal seguem abertas, agora por decisao registrada e nao por padrao.
grant execute on function public.portal_aluno_por_token(uuid)      to anon;
grant execute on function public.portal_pagamentos_por_token(uuid) to anon;
grant execute on function public.portal_contrato_por_token(uuid)   to anon;
