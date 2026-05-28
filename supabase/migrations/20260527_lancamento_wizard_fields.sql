-- Migration: campos do wizard de lançamento
-- Adiciona turma destino, responsavel e campos de auto-matrícula

-- lancamentos: turma destino + responsavel + campos financeiros
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS turma_destino_id uuid REFERENCES turmas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES responsaveis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS produto_destino text,
  ADD COLUMN IF NOT EXISTS valor_mensalidade_destino numeric,
  ADD COLUMN IF NOT EXISTS dia_vencimento_destino int,
  ADD COLUMN IF NOT EXISTS total_mensalidades_destino int;

-- npa_eventos: turma destino + responsavel
ALTER TABLE npa_eventos
  ADD COLUMN IF NOT EXISTS turma_destino_id uuid REFERENCES turmas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES responsaveis(id) ON DELETE SET NULL;

-- alunos: token único para formulário de contrato
ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS contrato_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS contrato_link_enviado_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS alunos_contrato_token_idx ON alunos(contrato_token);
