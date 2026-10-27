-- Rotina do CEO: checklist diário (pedido do Pedro 23/10/2026).
-- Reset "de graça": a tela sempre consulta por data = hoje, então um dia
-- novo começa sem nenhuma linha em ceo_rotina_conclusoes pra essa data.

create table public.ceo_rotina_itens (
  id uuid primary key default gen_random_uuid(),
  departamento text not null,
  texto text not null,
  ordem integer not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ceo_rotina_conclusoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.ceo_rotina_itens(id) on delete cascade,
  data date not null,
  concluido_em timestamptz not null default now(),
  concluido_por uuid references auth.users(id),
  unique (item_id, data)
);

alter table public.ceo_rotina_itens enable row level security;
alter table public.ceo_rotina_conclusoes enable row level security;

create policy "ceo_rotina_itens_admin_all"
  on public.ceo_rotina_itens
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "ceo_rotina_conclusoes_admin_all"
  on public.ceo_rotina_conclusoes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.ceo_rotina_itens to authenticated;
grant select, insert, update, delete on public.ceo_rotina_conclusoes to authenticated;

insert into public.ceo_rotina_itens (departamento, texto, ordem) values
  ('financeiro', 'Verificar pendências do dia', 1),
  ('financeiro', 'Olhar inadimplência', 2),
  ('financeiro', 'Olhar caixa', 3),
  ('financeiro', 'Enviar cobranças pendentes', 4),
  ('financeiro', 'Negociações em andamento', 5),
  ('comercial', 'Ver Diretoria Comercial (leads do dia, follow-up vencido, comissão)', 6),
  ('pedagogico', 'Ver Diretoria Pedagógico (aulas do dia, presença pendente, avaliações)', 7),
  ('marketing', 'Ver Diretoria Marketing / Kanban de conteúdo', 8),
  ('rh', 'Ver Diretoria RH (pagamentos, notas fiscais pendentes)', 9);
