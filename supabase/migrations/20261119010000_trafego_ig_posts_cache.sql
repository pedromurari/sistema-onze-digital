-- Cache de posts do Instagram (engajamento) pro card de métricas da Diretoria
-- de Marketing. Nosso token de sistema (meta-ads) não tem permissão
-- instagram_basic -- só a MCP da sessão do Claude consegue ler o Instagram
-- hoje. Por isso isso é um SNAPSHOT que o Claude atualiza manualmente, não
-- uma leitura ao vivo. Se o Pedro adicionar instagram_basic ao token de
-- sistema, dá pra trocar por uma action nova na edge function meta-ads.
create table public.trafego_ig_posts_cache (
  post_id text primary key,
  ig_username text not null,
  caption text,
  like_count integer not null default 0,
  comments_count integer not null default 0,
  media_type text,
  permalink text,
  publicado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.trafego_ig_posts_cache enable row level security;
revoke all on public.trafego_ig_posts_cache from public, anon;
grant select, insert, update, delete on public.trafego_ig_posts_cache to authenticated;

create policy trafego_ig_posts_cache_ver on public.trafego_ig_posts_cache
  for select using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_ig_posts_cache_escrever on public.trafego_ig_posts_cache
  for insert with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_ig_posts_cache_atualizar on public.trafego_ig_posts_cache
  for update using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ))
             with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_ig_posts_cache_excluir on public.trafego_ig_posts_cache
  for delete using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));

comment on table public.trafego_ig_posts_cache is
  'Snapshot manual de posts do Instagram (curtidas/comentários) -- atualizado pelo Claude via MCP da Meta, não é leitura ao vivo do site.';
