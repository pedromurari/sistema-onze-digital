-- Pedido do dono: acompanhar parceiro por meta de vídeo e de venda, semanal e mensal,
-- direto no Dashboard. Nenhum dos dois existia — vendas já é calculada em parceiros_vendas,
-- mas vídeo postado não tinha registro nenhum no sistema.

alter table public.parceiros
  add column if not exists meta_videos_semanal smallint,
  add column if not exists meta_videos_mensal   smallint,
  add column if not exists meta_vendas_semanal  smallint,
  add column if not exists meta_vendas_mensal   smallint;

comment on column public.parceiros.meta_videos_semanal is 'Meta de vídeos postados por semana. Nula = sem meta definida.';
comment on column public.parceiros.meta_videos_mensal   is 'Meta de vídeos postados por mês. Nula = sem meta definida.';
comment on column public.parceiros.meta_vendas_semanal   is 'Meta de vendas (quantidade) por semana. Nula = sem meta definida.';
comment on column public.parceiros.meta_vendas_mensal     is 'Meta de vendas (quantidade) por mês. Nula = sem meta definida.';

create table public.parceiro_videos (
  id             uuid primary key default gen_random_uuid(),
  parceiro_id    uuid not null references public.parceiros(id) on delete cascade,
  link           text not null,
  data_postagem  date not null default current_date,
  created_at     timestamptz not null default now()
);

comment on table public.parceiro_videos is
  'Um vídeo postado = uma linha, com link e data — para medir a meta semanal/mensal de vídeo do parceiro.';

alter table public.parceiro_videos enable row level security;

-- Mesmo padrão já usado em parceiros/parceiros_produtos/parceiros_vendas: admin gerencia
-- tudo, a parceira só enxerga e mantém o que é dela (aqui ela também registra o próprio
-- vídeo, sem precisar pedir pro admin cadastrar).
revoke all on public.parceiro_videos from anon, public;

create policy "Admin can manage parceiro_videos"
  on public.parceiro_videos for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

create policy "Parceira can manage own videos"
  on public.parceiro_videos for all
  using (parceiro_id in (select id from public.parceiros where user_id = (select auth.uid())))
  with check (parceiro_id in (select id from public.parceiros where user_id = (select auth.uid())));

grant select, insert, update, delete on public.parceiro_videos to authenticated;
