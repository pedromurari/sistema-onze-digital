-- Sprint 1.1c — `revoke ... from anon` nao surtiu efeito porque o GRANT real
-- estava em PUBLIC, e `anon` herda de PUBLIC. Aqui o EXECUTE sai de PUBLIC e
-- volta explicitamente so para quem precisa.

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

grant execute on function public.portal_aluno_por_token(uuid)      to anon;
grant execute on function public.portal_pagamentos_por_token(uuid) to anon;
grant execute on function public.portal_contrato_por_token(uuid)   to anon;

-- `has_role` e chamada de dentro de 7 policies com role {public} (que inclui anon)
-- e executa como o usuario da consulta — sem EXECUTE aqui essas policies quebram.
grant execute on function public.has_role(uuid, app_role) to authenticated, anon, service_role;

-- Novas funcoes nao devem nascer abertas para PUBLIC.
alter default privileges in schema public revoke execute on functions from public;
