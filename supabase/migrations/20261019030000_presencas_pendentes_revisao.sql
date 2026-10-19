-- Fila de revisao manual pra presenca de aluno que nao bateu 100% (CPF certo,
-- mas nome/data/turma com alguma diferenca). Em vez de so recusar e travar o
-- aluno na hora da aula, registra pra secretaria conferir depois.
-- Pedido do Pedro 19/10/2026, durante a primeira aula com o link de verdade.
create table public.presencas_pendentes_revisao (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas(id) on delete cascade,
  nome_informado text not null,
  cpf_informado text not null,
  nascimento_informado date not null,
  motivo text not null,
  resolvido boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.presencas_pendentes_revisao enable row level security;
revoke all on public.presencas_pendentes_revisao from public, anon;
grant select, update on public.presencas_pendentes_revisao to authenticated;
create policy presencas_pendentes_revisao_ver on public.presencas_pendentes_revisao
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy presencas_pendentes_revisao_atualizar on public.presencas_pendentes_revisao
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
