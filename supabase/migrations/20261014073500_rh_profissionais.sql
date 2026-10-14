-- RH item 1 (ROADMAP.md): Cadastro de Profissional. Base de tudo -- Lista de
-- Presenca e Fechamento de Folha dependem desta tabela existir primeiro.
begin;

insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('rh', 'RH', 'RH', 17)
on conflict (chave) do nothing;

insert into public.role_permissoes (papel, recurso, acao) values
  ('admin', 'rh', 'ver'), ('admin', 'rh', 'editar'), ('admin', 'rh', 'excluir'), ('admin', 'rh', 'ver_todos'),
  ('gestor', 'rh', 'ver'), ('gestor', 'rh', 'editar'), ('gestor', 'rh', 'ver_todos')
on conflict do nothing;

create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 160),
  funcao text check (funcao is null or length(btrim(funcao)) between 1 and 80),
  contato text,
  pix text,
  documento text,
  vinculo text check (vinculo is null or vinculo in ('clt', 'pj', 'autonomo', 'voluntario', 'outro')),
  modelo_pagamento text not null default 'por_aula' check (modelo_pagamento in ('fixo', 'por_aula', 'comissao', 'ajuda_custo', 'hibrido')),
  valor_fixo numeric(12,2) check (valor_fixo is null or valor_fixo >= 0),
  valor_por_aula numeric(12,2) check (valor_por_aula is null or valor_por_aula >= 0),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profissionais_ativo_idx on public.profissionais (ativo, nome);

alter table public.profissionais enable row level security;
revoke all on public.profissionais from public, anon;
grant select, insert, update, delete on public.profissionais to authenticated;

create policy profissionais_ver on public.profissionais
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy profissionais_inserir on public.profissionais
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy profissionais_atualizar on public.profissionais
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy profissionais_excluir on public.profissionais
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));

-- set_updated_at() generico escreve em NEW.updated_at -- por isso a coluna
-- acima ja nasce com esse nome, em vez de atualizado_em.
create trigger profissionais_set_updated_at before update on public.profissionais
  for each row execute function public.set_updated_at();

commit;
