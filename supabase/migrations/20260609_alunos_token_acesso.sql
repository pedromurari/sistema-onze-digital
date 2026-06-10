-- F3: Token de acesso único por aluno para a Área de Membros

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS token_acesso uuid DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS link_grupo_whatsapp text;

-- Garante que alunos existentes recebam token
UPDATE alunos SET token_acesso = gen_random_uuid() WHERE token_acesso IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_token_acesso
  ON alunos (token_acesso);
