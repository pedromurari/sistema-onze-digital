-- Gestor de Tráfego: tag de produto por campanha (pro filtro visual) e regras
-- de automação (ponto de configuração da Fase 1 do plano, docs/GESTOR_TRAFEGO.md).
-- Execução das regras (cron lendo esta tabela e chamando a edge function meta-ads)
-- ainda não existe -- aqui só fica o cadastro/configuração.
begin;

create table public.trafego_campanha_produto (
  campanha_id text primary key,
  conta_id text not null,
  produto_id uuid references public.produtos(id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

alter table public.trafego_campanha_produto enable row level security;
revoke all on public.trafego_campanha_produto from public, anon;
grant select, insert, update, delete on public.trafego_campanha_produto to authenticated;

create policy trafego_campanha_produto_ver on public.trafego_campanha_produto
  for select using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_campanha_produto_inserir on public.trafego_campanha_produto
  for insert with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_campanha_produto_atualizar on public.trafego_campanha_produto
  for update using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ))
             with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_campanha_produto_excluir on public.trafego_campanha_produto
  for delete using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));

comment on table public.trafego_campanha_produto is
  'Tag manual de produto por campanha do Meta Ads, pro filtro visual no Gestor de Tráfego. Nome de campanha não é confiável o suficiente pra inferir produto sozinho.';

create table public.trafego_regras (
  id uuid primary key default gen_random_uuid(),
  conta_id text not null,
  -- 'conjunto' é o nível real de orçamento/decisão (Pedro usa ABO: 1 criativo por
  -- conjunto, orçamento no conjunto, não na campanha). 'campanha' e 'produto' ficam
  -- como escopo mais largo (ex: pausar a campanha toda), não o uso principal.
  escopo_tipo text not null check (escopo_tipo in ('conjunto', 'campanha', 'produto', 'conta')),
  escopo_valor text, -- adset_id, campaign_id, produto_id (texto) ou null quando escopo_tipo='conta'
  metrica text not null default 'custo_por_lead' check (metrica in ('custo_por_lead')),
  limite numeric not null check (limite > 0), -- sempre em BRL
  -- 'duplicar' cobre tanto duplicar o conjunto quanto duplicar o criativo dentro
  -- dele -- a decisão de qual dos dois fica pro operador no momento de agir, não
  -- é automática ainda (ver comentário da tabela).
  acao text not null check (acao in ('pausar', 'reduzir_orcamento', 'aumentar_orcamento', 'duplicar')),
  valor_acao numeric check (valor_acao is null or valor_acao > 0), -- percentual, null quando acao='pausar'
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id),
  check (
    (escopo_tipo = 'conta' and escopo_valor is null) or
    (escopo_tipo in ('campanha', 'produto') and escopo_valor is not null)
  ),
  check ((acao in ('pausar', 'duplicar')) = (valor_acao is null))
);
create index trafego_regras_conta_idx on public.trafego_regras (conta_id) where ativa;

alter table public.trafego_regras enable row level security;
revoke all on public.trafego_regras from public, anon;
grant select, insert, update, delete on public.trafego_regras to authenticated;

create policy trafego_regras_ver on public.trafego_regras
  for select using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_regras_inserir on public.trafego_regras
  for insert with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_regras_atualizar on public.trafego_regras
  for update using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ))
             with check (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));
create policy trafego_regras_excluir on public.trafego_regras
  for delete using (( select public.tem_permissao('trafego_gestor'::text, 'ver'::text) ));

create trigger trafego_regras_set_updated_at before update on public.trafego_regras
  for each row execute function public.set_updated_at();

comment on table public.trafego_regras is
  'Regras de automação do Gestor de Tráfego (limite de custo por lead -> pausar/ajustar orçamento). Cadastro apenas -- execução automática ainda não implementada.';

commit;
