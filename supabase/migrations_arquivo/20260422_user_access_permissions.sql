create table if not exists public.user_access_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_view_dashboard boolean not null default true,
  can_view_pipeline boolean not null default true,
  can_view_lancamentos boolean not null default true,
  can_view_all_lancamentos boolean not null default true,
  allowed_lancamento_ids text[] not null default '{}',
  can_view_npa boolean not null default true,
  can_view_aula_secreta boolean not null default true,
  can_view_chat boolean not null default true,
  can_view_sheets boolean not null default true,
  can_view_financeiro boolean not null default true,
  can_view_balanco boolean not null default true,
  can_view_operacoes boolean not null default true,
  can_view_mapa_mental boolean not null default true,
  can_view_rodrygo boolean not null default true,
  can_view_pedagogico boolean not null default true,
  can_view_all_turmas boolean not null default true,
  allowed_turma_ids text[] not null default '{}',
  can_view_team boolean not null default false,
  can_view_settings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_access_permissions (user_id)
select p.id
from public.profiles p
where not exists (
  select 1
  from public.user_access_permissions uap
  where uap.user_id = p.id
);

update public.user_access_permissions uap
set
  can_view_team = true,
  can_view_settings = true,
  updated_at = now()
from public.user_roles ur
where ur.user_id = uap.user_id
  and ur.role = 'admin';

alter table public.user_access_permissions enable row level security;

drop policy if exists "Admins can manage user access permissions" on public.user_access_permissions;
create policy "Admins can manage user access permissions"
on public.user_access_permissions
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role))
with check (public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users can read own access permissions" on public.user_access_permissions;
create policy "Users can read own access permissions"
on public.user_access_permissions
for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'::app_role));
