-- Funcao security definer que expoe o token + repo do GitHub (vault do Obsidian da
-- Equipe 11DS) guardados no Supabase Vault. Mesmo padrao de
-- get_equipe_11ds_cron_secret / get_equipe_11ds_composite_config: os valores em si
-- sao criados via `select vault.create_secret(...)` fora do controle de versao,
-- nunca em texto puro no git. Apenas o service_role pode executar.

create or replace function public.get_equipe_11ds_github_config()
returns table(token text, repo text)
language sql
security definer
set search_path = public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_github_token' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_github_repo' limit 1);
$$;

revoke all on function public.get_equipe_11ds_github_config() from public, anon, authenticated;
grant execute on function public.get_equipe_11ds_github_config() to service_role;
