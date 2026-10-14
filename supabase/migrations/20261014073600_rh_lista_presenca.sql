-- RH item 2 (ROADMAP.md): Lista de Presenca. Depende de profissionais (item 1)
-- ja existir. Vive conceitualmente em RH e Pedagogico (ver nota no Obsidian).
-- Professor/aluno confirmando presenca pelo bot do Telegram ainda nao existe
-- (parte do Bot da Empresa, trabalho futuro) -- quando existir, sera uma edge
-- function com service_role gravando aqui, nao insert direto autenticado.
begin;

create table public.aulas (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas(id),
  profissional_id uuid references public.profissionais(id),
  data date not null,
  horario_inicio time,
  horario_fim time,
  modulo text check (modulo is null or length(btrim(modulo)) between 1 and 160),
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada', 'adiada')),
  link_meet text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aulas_turma_data_idx on public.aulas (turma_id, data desc);
create index aulas_profissional_data_idx on public.aulas (profissional_id, data desc);

alter table public.aulas enable row level security;
revoke all on public.aulas from public, anon;
grant select, insert, update, delete on public.aulas to authenticated;

create policy aulas_ver on public.aulas
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy aulas_inserir on public.aulas
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy aulas_atualizar on public.aulas
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy aulas_excluir on public.aulas
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));

create trigger aulas_set_updated_at before update on public.aulas
  for each row execute function public.set_updated_at();

create table public.presencas (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas(id),
  tipo text not null check (tipo in ('professor', 'aluno')),
  profissional_id uuid references public.profissionais(id),
  aluno_id uuid references public.alunos(id),
  presente boolean not null default true,
  assinado_em timestamptz,
  created_at timestamptz not null default now(),
  check (
    (tipo = 'professor' and profissional_id is not null and aluno_id is null) or
    (tipo = 'aluno' and aluno_id is not null and profissional_id is null)
  )
);
create unique index presencas_aula_profissional_unico
  on public.presencas (aula_id, profissional_id) where tipo = 'professor';
create unique index presencas_aula_aluno_unico
  on public.presencas (aula_id, aluno_id) where tipo = 'aluno';
create index presencas_aula_idx on public.presencas (aula_id);

alter table public.presencas enable row level security;
revoke all on public.presencas from public, anon;
grant select, insert, update, delete on public.presencas to authenticated;

create policy presencas_ver on public.presencas
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy presencas_inserir on public.presencas
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy presencas_atualizar on public.presencas
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy presencas_excluir on public.presencas
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));

commit;
