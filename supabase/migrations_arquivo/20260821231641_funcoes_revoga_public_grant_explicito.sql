-- Sprint 1.1c — Corrige o passo anterior.
--
-- `revoke ... from anon` nao surtiu efeito porque o GRANT real estava em PUBLIC,
-- e `anon` herda de PUBLIC. Aqui o EXECUTE sai de PUBLIC e volta explicitamente
-- so para quem precisa:
--   * service_role  → tudo (edge functions)
--   * authenticated → tudo, menos os getters de segredo e o disparo de notificacao
--                     em massa (o escopo POR DADO do usuario logado e tratado na
--                     RLS das tabelas, sprint 1.3 — nao no grant da funcao)
--   * anon          → so as 3 RPC do portal publico
--
-- Funcoes de trigger nao entram: o Postgres recusa chamada direta a elas e mexer
-- no grant quebraria INSERT legitimo.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant  execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Volta o acesso do usuario logado, exceto segredos e notificacao em massa.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and p.proname !~ '^get_(equipe_11ds|idm_reels|pexels)'
      and p.proname not in ('notificar_admins', 'notificar_vendedores_ativos')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- Portal publico.
grant execute on function public.portal_aluno_por_token(uuid)      to anon;
grant execute on function public.portal_pagamentos_por_token(uuid) to anon;
grant execute on function public.portal_contrato_por_token(uuid)   to anon;

-- `has_role` e chamada de dentro das policies de RLS e executa como o usuario da
-- consulta — sem EXECUTE aqui, toda policy que a usa passa a negar acesso.
grant execute on function public.has_role(uuid, app_role) to authenticated, anon, service_role;

-- Novas funcoes nao devem nascer abertas para PUBLIC/anon.
alter default privileges in schema public revoke execute on functions from public;
