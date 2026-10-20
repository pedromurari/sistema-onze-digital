-- RH item 3 do ROADMAP: Fechamento de Folha de verdade (nao so previa).
-- "Fechar" trava o calculo daquele mes numa tabela historica -- se depois
-- alguem lancar aula retroativa ou editar presenca, o numero que foi fechado
-- nao muda sozinho. Pagamento de verdade continua manual, com comprovante,
-- no historico de cada profissional (profissionais_pagamentos); esta tabela
-- so guarda o calculo sugerido e o status fechado/aberto por competencia.
-- Pedido do Pedro 20/10/2026.

create table public.folha_fechamentos (
  id uuid primary key default gen_random_uuid(),
  competencia text not null,
  fechado_em timestamptz not null default now(),
  fechado_por uuid references auth.users(id),
  total_geral numeric(12,2) not null default 0,
  reaberto_em timestamptz,
  unique (competencia)
);

create table public.folha_fechamentos_itens (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.folha_fechamentos(id) on delete cascade,
  profissional_id uuid not null references public.profissionais(id),
  aulas_confirmadas int not null default 0,
  valor_aulas numeric(12,2) not null default 0,
  valor_fixo numeric(12,2) not null default 0,
  comissoes_pendentes numeric(12,2) not null default 0,
  ja_pago_no_mes numeric(12,2) not null default 0,
  total_sugerido numeric(12,2) not null default 0,
  requer_revisao boolean not null default false,
  observacao text
);

alter table public.folha_fechamentos enable row level security;
alter table public.folha_fechamentos_itens enable row level security;
revoke all on public.folha_fechamentos from public, anon;
revoke all on public.folha_fechamentos_itens from public, anon;
grant select, insert, update, delete on public.folha_fechamentos to authenticated;
grant select, insert, update, delete on public.folha_fechamentos_itens to authenticated;

create policy folha_fechamentos_ver on public.folha_fechamentos
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy folha_fechamentos_editar on public.folha_fechamentos
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy folha_fechamentos_atualizar on public.folha_fechamentos
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy folha_fechamentos_excluir on public.folha_fechamentos
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));

create policy folha_fechamentos_itens_ver on public.folha_fechamentos_itens
  for select using (( select public.tem_permissao('rh'::text, 'ver'::text) ));
create policy folha_fechamentos_itens_editar on public.folha_fechamentos_itens
  for insert with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy folha_fechamentos_itens_atualizar on public.folha_fechamentos_itens
  for update using (( select public.tem_permissao('rh'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('rh'::text, 'editar'::text) ));
create policy folha_fechamentos_itens_excluir on public.folha_fechamentos_itens
  for delete using (( select public.tem_permissao('rh'::text, 'excluir'::text) ));
