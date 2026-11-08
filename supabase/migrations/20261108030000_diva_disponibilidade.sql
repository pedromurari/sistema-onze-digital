-- Fase 8 do plano Divã IDM: agenda de disponibilidade própria por terapeuta
-- (Cal.com perdeu a versão grátis multi-usuário em abril/2026, ver relatório
-- de pesquisa de mercado) -- grade semanal recorrente, usada pelo time
-- comercial pra saber quando o terapeuta está livre ao negociar sessão com
-- um lead. Mesmo padrão de RLS/GRANT das outras tabelas do Divã.

create table public.diva_disponibilidade (
  id uuid primary key default gen_random_uuid(),
  terapeuta_id uuid not null references public.diva_terapeutas(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=domingo .. 6=sábado
  horario_inicio time not null,
  horario_fim time not null check (horario_fim > horario_inicio),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index diva_disponibilidade_terapeuta_idx on public.diva_disponibilidade(terapeuta_id);

alter table public.diva_disponibilidade enable row level security;

create policy diva_disponibilidade_ver on public.diva_disponibilidade
  for select to authenticated using (tem_permissao('diva', 'ver'));
create policy diva_disponibilidade_editar on public.diva_disponibilidade
  for all to authenticated using (tem_permissao('diva', 'editar')) with check (tem_permissao('diva', 'editar'));

grant select, insert, update, delete on public.diva_disponibilidade to authenticated;
grant select on public.diva_disponibilidade to anon;
create policy diva_disponibilidade_publico_anon on public.diva_disponibilidade
  for select to anon using (ativo and exists (
    select 1 from public.diva_terapeutas t where t.id = terapeuta_id and t.status = 'aprovado'
  ));

-- Janela real marcada quando a sessão é agendada -- data_sessao já existe
-- mas sem horário; sem isso não dá pra cruzar com a disponibilidade acima.
alter table public.diva_sessoes
  add column if not exists horario_inicio time,
  add column if not exists horario_fim time;
