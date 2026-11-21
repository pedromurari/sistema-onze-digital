-- Nova categoria de produto: 'constelacao-familiar' (Despertar Sistêmico,
-- Formação em Constelação Familiar Sistêmica). Pedido do Pedro 20/11/2026 --
-- a venda precisa aparecer no Financeiro como produto próprio, não misturada
-- com Psicanálise. O CHECK de `turmas.produto` e `alunos.produto` é o que
-- define as categorias válidas hoje (a aba do Financeiro lê daí).
alter table public.turmas drop constraint if exists turmas_produto_check;
alter table public.turmas add constraint turmas_produto_check
  check (produto = any (array[
    'psicanalise','numerologia','pnl-practitioner','pnl-master',
    'sociedade-idm','npa-mentoria','constelacao-familiar'
  ]));

alter table public.alunos drop constraint if exists alunos_produto_check;
alter table public.alunos add constraint alunos_produto_check
  check (produto = any (array[
    'psicanalise','numerologia','pnl-practitioner','pnl-master',
    'sociedade-idm','npa-mentoria','constelacao-familiar'
  ]));

-- Turma onde caem as matrículas vindas da página de vendas.
-- data_inicio e as aulas ficam pendentes: dependem das datas do Rodrygo.
insert into public.turmas (nome, tipo, produto, valor_mensalidade, total_mensalidades, descricao)
select
  'Despertar Sistêmico — Turma 01',
  'constelacao-familiar',
  'constelacao-familiar',
  497.00,
  1,
  'Formação em Constelação Familiar Sistêmica — 3 meses, 8 módulos, 12 aulas, encontros quinzenais ao vivo + plataforma.'
where not exists (
  select 1 from public.turmas where produto = 'constelacao-familiar'
);

-- Liga a oferta da página de vendas à categoria de produto do CRM. É por aqui
-- que o webhook sabe em qual turma matricular e em qual aba do Financeiro
-- lançar a venda.
alter table public.formacao_ofertas
  add column if not exists produto_crm text;

comment on column public.formacao_ofertas.produto_crm is
  'Categoria de produto no CRM (mesmo valor de turmas.produto). Define turma da matrícula e aba do Financeiro.';

update public.formacao_ofertas
   set produto_crm = 'constelacao-familiar'
 where slug = 'constelacao-familiar';
