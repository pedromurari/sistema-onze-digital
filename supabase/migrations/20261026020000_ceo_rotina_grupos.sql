-- Fase 2 da Rotina do CEO: grupo de WhatsApp por departamento (Pedro +
-- Rodrygo + ponto focal do setor, admin/envio pelo número "Instituto
-- Despertamente"/IDM). Pedido do Pedro 23/10/2026, grupos confirmados e
-- linkados em 26/10/2026.

create table public.ceo_rotina_grupos (
  id uuid primary key default gen_random_uuid(),
  departamento text not null unique,
  grupo_jid text not null,
  grupo_nome text,
  instancia text not null default 'Instituto Despertamente',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ceo_rotina_grupos enable row level security;

create policy "ceo_rotina_grupos_admin_all"
  on public.ceo_rotina_grupos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ceo_rotina_grupos to authenticated;

insert into public.ceo_rotina_grupos (departamento, grupo_jid, grupo_nome, instancia) values
  ('marketing', '120363431985554006@g.us', 'DP - Marketing', 'Instituto Despertamente'),
  ('comercial', '120363412322100973@g.us', 'DP - Comercial', 'Instituto Despertamente'),
  ('pedagogico', '120363411678381404@g.us', 'DP - Pedagógico', 'Instituto Despertamente'),
  ('financeiro', '120363413678738745@g.us', 'DP - Financeiro', 'Instituto Despertamente');
