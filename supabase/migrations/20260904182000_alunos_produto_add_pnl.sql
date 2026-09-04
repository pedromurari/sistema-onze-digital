-- Adiciona 'pnl-practitioner' e 'pnl-master' como produto valido em alunos --
-- registrados via pnl_matricula_criar.
ALTER TABLE public.alunos DROP CONSTRAINT alunos_produto_check;
ALTER TABLE public.alunos ADD CONSTRAINT alunos_produto_check
  CHECK (produto = ANY (ARRAY['psicanalise'::text, 'numerologia'::text, 'pnl-practitioner'::text, 'pnl-master'::text]));
