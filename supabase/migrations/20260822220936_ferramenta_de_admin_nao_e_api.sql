-- Completa o fechamento anterior, que so cobriu `anon` e deixou `authenticated` aberto.
--
-- ── O QUE AINDA ESTAVA ABERTO ───────────────────────────────────────────────
-- `aplicar_camada`, `aplicar_camada_catalogo` e `aplicar_camada_multi` sao SECURITY
-- DEFINER, fazem DDL (derrubam e recriam policies de RLS) e NAO tem guarda nenhuma —
-- qualquer pessoa logada podia chamar:
--
--     POST /rest/v1/rpc/aplicar_camada_multi
--     { "p_tabela": "pagamentos", "p_recursos": ["qualquer_coisa"] }
--
-- e reescrever a seguranca de qualquer tabela. A vendedora tem login; isso bastava.
--
-- Junto: `gerar_mensalidades_para` (cria parcelas para qualquer aluno) e `resolver_pessoa`
-- (escreve em pessoas), tambem sem guarda.
--
-- Conferido antes de revogar: NENHUMA delas e chamada pelo app. As RPCs que o frontend
-- usa sao as do time comercial, do portal, de permissao e `notificar` — nenhuma aqui.
--
-- ── FUNCAO DE GATILHO NAO PRECISA DE GRANT ──────────────────────────────────
-- O Postgres nao confere EXECUTE ao disparar um gatilho: a funcao roda como parte da
-- operacao na tabela. Entao o grant nelas nunca serviu para nada alem de expo-las como
-- RPC. Entre elas esta `trigger_lancamento_lead_bv`, que MANDA MENSAGEM DE BOAS-VINDAS.
--
-- `definir_permissao` fica como esta: tem guarda de verdade
-- (`if not public.is_admin() then raise exception`) e o frontend usa.

-- ── 1. Ferramentas de administracao saem da API ─────────────────────────────
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace nm on nm.oid = p.pronamespace
     where nm.nspname = 'public'
       and p.proname in ('aplicar_camada', 'aplicar_camada_catalogo', 'aplicar_camada_multi',
                         'gerar_mensalidades_para', 'resolver_pessoa', 'rls_auto_enable')
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated, public',
                   f.proname, f.args);
    n := n + 1;
  end loop;
  raise notice 'ferramentas de admin fechadas: %', n;
end $$;

-- ── 2. Funcoes de gatilho param de ser chamaveis ────────────────────────────
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace nm on nm.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
     where nm.nspname = 'public'
       and t.typname in ('trigger', 'event_trigger')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke execute on function public.%I(%s) from anon, authenticated, public',
                   f.proname, f.args);
    n := n + 1;
  end loop;
  raise notice 'funcoes de gatilho fechadas: %', n;
end $$;

-- ── 3. O padrao tambem para `authenticated` ─────────────────────────────────
-- A migration anterior tirou o padrao so de anon e public. Sem esta linha, a proxima
-- funcao criada volta a nascer chamavel por qualquer pessoa logada — que e como as
-- `aplicar_camada` chegaram aqui.
alter default privileges in schema public revoke execute on functions from authenticated;

-- Quem precisar de acesso pelo app recebe grant explicito na propria migration que a cria.
-- As que o frontend usa hoje continuam abertas porque ja tem grant proprio.
