-- Funcao security definer que expoe o secret do cron guardado no Supabase Vault
-- (o valor em si e' criado via `select vault.create_secret(...)` fora do controle de
-- versao, para nunca ficar em texto puro no git). Apenas o service_role (usado pelas
-- edge functions e pelo pg_cron) pode executar esta funcao.

create or replace function public.get_equipe_11ds_cron_secret()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'equipe_11ds_cron_secret' limit 1;
$$;

revoke all on function public.get_equipe_11ds_cron_secret() from public, anon, authenticated;
grant execute on function public.get_equipe_11ds_cron_secret() to service_role;
