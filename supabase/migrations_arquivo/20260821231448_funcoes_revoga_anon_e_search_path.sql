-- Sprint 1.1b — Funcoes do schema public: tirar `anon` de tudo que nao e portal
-- publico, trancar os getters de segredo, e fixar `search_path`.
--
-- Situacao encontrada:
--   * `get_equipe_11ds_elevenlabs_key()` e `get_idm_reels_worker_config()` eram
--     SECURITY DEFINER e executaveis por `anon` — com a chave publica do site dava
--     pra extrair as API keys.
--   * Todas as RPC `time_comercial_*` eram executaveis por `anon`, contornando a
--     RLS por dono que a `leads` ganhou em 20260820123000. `time_comercial_registrar_contato`
--     ainda permitia ESCRITA sem login.
--   * 29 funcoes sem `search_path` fixo (vetor de sequestro em SECURITY DEFINER).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Nenhuma funcao chamavel por `anon`, exceto as 3 do portal publico.
--    Funcoes de trigger ficam de fora: o Postgres recusa chamada direta a elas,
--    e revogar quebraria os INSERTs legitimos (inclusive a captura publica).
-- ─────────────────────────────────────────────────────────────────────────────
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
      and p.proname not in (
        'portal_aluno_por_token',
        'portal_pagamentos_por_token',
        'portal_contrato_por_token'
      )
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Getters de segredo: so `service_role` (quem chama sao edge functions).
--    Nem o usuario logado precisa ler chave de API.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.get_equipe_11ds_elevenlabs_key()   from public, anon, authenticated;
revoke execute on function public.get_equipe_11ds_composite_config() from public, anon, authenticated;
revoke execute on function public.get_equipe_11ds_cron_secret()      from public, anon, authenticated;
revoke execute on function public.get_equipe_11ds_github_config()    from public, anon, authenticated;
revoke execute on function public.get_idm_reels_worker_config()      from public, anon, authenticated;
revoke execute on function public.get_pexels_api_key()               from public, anon, authenticated;

-- Disparo de notificacao em massa tambem e coisa de backend.
revoke execute on function public.notificar_admins(text, text, text, text)             from public, anon, authenticated;
revoke execute on function public.notificar_vendedores_ativos(text, text, text, text)  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) `search_path` fixo em toda funcao que estava sem.
--    `extensions`/`net`/`cron` entram porque algumas funcoes usam pg_net e pg_cron;
--    schema inexistente no search_path e ignorado pelo Postgres, entao e seguro.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proconfig is null
  loop
    execute format('alter function %s set search_path = public, extensions, net, cron, pg_temp', r.sig);
  end loop;
end $$;
