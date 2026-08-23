-- Pedido do dono ao ver a propria lista de gastos: "Chat GPT - Dia 14 - Onze/IDM" digitado
-- na DESCRICAO, porque nao havia campo nenhum para dia de vencimento nem para quem paga.
-- `recorrente` ja existia em `balanco_itens` mas nenhuma tela do app jamais gravava esse
-- campo como true — so o Financeiro CFO lia, ninguem escrevia.
--
-- Aqui: um campo de dia de vencimento na propria despesa, e uma tabela de split por
-- responsavel — mesmo padrao de `turma_responsaveis`, aplicado a despesa em vez de turma.

alter table public.balanco_itens
  add column if not exists dia_vencimento smallint;

alter table public.balanco_itens
  add constraint balanco_itens_dia_vencimento_check
  check (dia_vencimento is null or (dia_vencimento between 1 and 28));

comment on column public.balanco_itens.dia_vencimento is
  'Dia de vencimento do custo fixo recorrente (1-28). Nulo em saida avulsa, que nao vence todo mes.';

create table public.despesa_responsaveis (
  id             uuid primary key default gen_random_uuid(),
  despesa_id     uuid not null references public.balanco_itens(id) on delete cascade,
  responsavel_id uuid references public.responsaveis(id),
  nome_ref       text not null,
  percentual     numeric not null default 100,
  created_at     timestamptz not null default now()
);

comment on table public.despesa_responsaveis is
  'Quem paga cada despesa e em que percentual — mesmo padrao de turma_responsaveis, para custo em vez de receita.';

alter table public.despesa_responsaveis enable row level security;

-- Grant explicito: novo padrao do projeto e funcao nova NAO nascer aberta por acidente
-- (ver migration anon_nao_executa_funcao_nova); o mesmo cuidado vale para tabela nova.
revoke all on public.despesa_responsaveis from anon, public;
grant select, insert, update, delete on public.despesa_responsaveis to authenticated;

select public.aplicar_camada_multi('despesa_responsaveis', array['balanco']);
