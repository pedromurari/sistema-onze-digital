-- Novo produto: Sociedade IDM -- adesão de sócio, mensalidade recorrente
-- R$100/mês, dia de vencimento escolhido por aluno (não fixo por turma, por
-- isso a turma "Contínua" não tem dia_vencimento definido). Não é uma turma
-- fechada com N parcelas fixas como psicanálise: é "pagou, tá dentro; não
-- pagou, é retirado" -- na prática usamos 120 parcelas (10 anos) pré-geradas
-- como prateleira de cobrança, reaproveitando toda a cobrança/DRE existente.
-- Estender depois com mais parcelas se algum sócio passar de 10 anos.

alter table public.turmas drop constraint turmas_produto_check;
alter table public.turmas add constraint turmas_produto_check
  check (produto = any (array['psicanalise', 'numerologia', 'pnl-practitioner', 'pnl-master', 'sociedade-idm']));

alter table public.alunos drop constraint alunos_produto_check;
alter table public.alunos add constraint alunos_produto_check
  check (produto = any (array['psicanalise', 'numerologia', 'pnl-practitioner', 'pnl-master', 'sociedade-idm']));

-- turmas_dia_vencimento_check já aceita NULL (CHECK com resultado unknown
-- passa em Postgres), então a turma "Contínua" pode ficar sem dia_vencimento
-- fixo -- cada sócio escolhe o dia dele no cadastro (alunos.dia_vencimento).

insert into public.turmas (nome, tipo, produto, data_inicio, data_fim, vagas, valor_mensalidade, total_mensalidades, dia_vencimento, descricao)
values ('Contínua', 'sociedade-idm', 'sociedade-idm', current_date, null, null, 100.00, 120, null,
  'Sociedade IDM -- adesão de sócio, mensalidade recorrente R$100. Turma contínua (sem turma fechada por data), entrada a qualquer momento. Dia de vencimento escolhido por sócio no cadastro.');
