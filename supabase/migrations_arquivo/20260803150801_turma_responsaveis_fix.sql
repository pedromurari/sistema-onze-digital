-- ================================================================
-- turma_responsaveis.user_id hoje é preenchido com um UUID aleatório
-- (crypto.randomUUID() no cliente) só para satisfazer o NOT NULL — não
-- referencia ninguém de verdade. Corrige para apontar de fato para
-- public.responsaveis(id), permitindo saber quem é o responsável/
-- investidor de cada turma e calcular o repasse corretamente.
-- Tabela está com 0 linhas em produção — sem necessidade de backfill.
-- ================================================================

ALTER TABLE public.turma_responsaveis ALTER COLUMN user_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'turma_responsaveis_responsavel_fk'
  ) THEN
    ALTER TABLE public.turma_responsaveis
      ADD CONSTRAINT turma_responsaveis_responsavel_fk
      FOREIGN KEY (user_id) REFERENCES public.responsaveis(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.turma_responsaveis.user_id IS
  'FK para responsaveis(id) — o responsável/investidor real dessa fatia da turma. nome_ref continua guardando o nome como snapshot de exibição.';
