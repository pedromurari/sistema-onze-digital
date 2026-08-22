alter table public.user_access_permissions
  add column if not exists can_view_all_financeiro_turmas boolean not null default true,
  add column if not exists allowed_financeiro_turma_ids text[] not null default '{}';
