-- Fase 2.2: snapshot imutável do DRE de um mês (competência).
--
-- O DRE por competência (DreCompetencia.tsx) é calculado ao vivo a partir de
-- pagamentos + balanco_itens. "Fechar o mês" congela o resultado numa linha
-- aqui -- assim o número que foi pro contador/gestão não muda se alguém lançar
-- uma despesa retroativa depois.
--
-- closed  = existe linha para (empresa, mes) E reaberto_em IS NULL
-- reabrir = seta reaberto_em (mantém o histórico); voltar a fechar faz upsert.

create table if not exists public.dre_fechamentos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'onze_digital',
  mes text not null,                                  -- 'YYYY-MM' (competência)
  receita_bruta numeric not null default 0,
  receita_por_produto jsonb not null default '[]'::jsonb,
  impostos numeric not null default 0,
  imposto_estimado boolean not null default false,
  taxas_gateway numeric not null default 0,
  estornos numeric not null default 0,
  receita_liquida numeric not null default 0,
  custos_diretos numeric not null default 0,
  custos_diretos_linhas jsonb not null default '[]'::jsonb,
  margem_contribuicao numeric not null default 0,
  despesas_fixas numeric not null default 0,
  despesas_fixas_linhas jsonb not null default '[]'::jsonb,
  ebitda numeric not null default 0,
  nao_operacional numeric not null default 0,          -- líquido: outras receitas − saídas
  nao_op_linhas jsonb not null default '[]'::jsonb,
  resultado numeric not null default 0,
  observacoes text,
  fechado_em timestamptz not null default now(),
  fechado_por text,
  reaberto_em timestamptz,
  created_at timestamptz not null default now(),
  unique (empresa, mes)
);

alter table public.dre_fechamentos enable row level security;

-- Mesma matriz de `fechamentos`: ver = financeiro/ver; gravar = financeiro/ver + editar.
create policy dre_fechamentos_ver on public.dre_fechamentos
  for select using (( select public.tem_permissao('financeiro'::text, 'ver'::text) ));
create policy dre_fechamentos_inserir on public.dre_fechamentos
  for insert with check (( select public.tem_permissao('financeiro'::text, 'ver'::text) ) and ( select public.tem_permissao('financeiro'::text, 'editar'::text) ));
create policy dre_fechamentos_update on public.dre_fechamentos
  for update using (( select public.tem_permissao('financeiro'::text, 'ver'::text) ) and ( select public.tem_permissao('financeiro'::text, 'editar'::text) ))
             with check (( select public.tem_permissao('financeiro'::text, 'ver'::text) ) and ( select public.tem_permissao('financeiro'::text, 'editar'::text) ));
create policy dre_fechamentos_delete on public.dre_fechamentos
  for delete using (( select public.tem_permissao('financeiro'::text, 'ver'::text) ) and ( select public.tem_permissao('financeiro'::text, 'editar'::text) ));

comment on table public.dre_fechamentos is
  'Snapshot imutavel do DRE de um mes (competencia). Ver DreCompetencia.tsx / docs/FINANCEIRO.md Fase 2.2.';
