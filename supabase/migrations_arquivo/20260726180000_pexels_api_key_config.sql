-- Chave da API do Pexels (banco de imagens stock) pro Modo A do Reels IDM --
-- trocou gerar imagem por IA (gpt-image-1.5) por buscar foto de banco real,
-- por pedido explicito do usuario (imagens geradas ficaram inconsistentes).
-- Mesmo padrao das outras chaves de terceiro: Vault + funcao security definer,
-- nunca em texto puro no git, so service_role pode executar.

-- select vault.create_secret('<a chave real>', 'pexels_api_key'); -- ja aplicado direto, nao versionado aqui

create or replace function public.get_pexels_api_key()
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pexels_api_key' limit 1;
$$;

revoke all on function public.get_pexels_api_key() from public, anon, authenticated;
grant execute on function public.get_pexels_api_key() to service_role;
