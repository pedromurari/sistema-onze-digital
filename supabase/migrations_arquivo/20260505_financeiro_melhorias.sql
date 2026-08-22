-- ─── Melhorias no sistema financeiro ────────────────────────────────────────

-- 1. Corrige total de parcelas para 15 (estava 14)
ALTER TABLE turmas ALTER COLUMN total_mensalidades SET DEFAULT 15;
ALTER TABLE alunos  ALTER COLUMN total_mensalidades SET DEFAULT 15;

UPDATE turmas SET total_mensalidades = 15 WHERE total_mensalidades = 14;
UPDATE alunos  SET total_mensalidades = 15 WHERE total_mensalidades = 14;

-- 2. Data de matrícula (data do ato de matrícula / primeiro pagamento)
ALTER TABLE alunos ADD COLUMN IF NOT EXISTS data_matricula date;
UPDATE alunos SET data_matricula = data_inicio::date
  WHERE data_matricula IS NULL AND data_inicio IS NOT NULL;

-- 3. Marca pagamentos vencidos como atrasados
UPDATE pagamentos
SET status = 'atrasado'
WHERE status = 'pendente'
  AND data_vencimento < CURRENT_DATE;

-- 4. Atualiza status do aluno automaticamente
UPDATE alunos
SET status = 'inadimplente'
WHERE status = 'ativo'
  AND id IN (
    SELECT DISTINCT aluno_id FROM pagamentos WHERE status = 'atrasado'
  );

-- 5. View financeira consolidada por aluno
CREATE OR REPLACE VIEW vw_alunos_financeiro AS
SELECT
  a.id,
  a.nome,
  a.status,
  a.turma_id,
  a.produto,
  a.forma_pagamento,
  a.contrato_enviado,
  a.contrato_assinado,
  a.data_matricula,
  a.data_inicio,
  a.mensalidades_pagas,
  a.total_mensalidades,
  COALESCE(a.valor_mensalidade, t.valor_mensalidade) AS valor_efetivo,
  t.nome AS turma_nome,
  COUNT(p.id) FILTER (WHERE p.status = 'pago')    AS parcelas_pagas,
  COUNT(p.id) FILTER (WHERE p.status = 'atrasado') AS parcelas_atrasadas,
  COUNT(p.id) FILTER (WHERE p.status = 'pendente') AS parcelas_pendentes,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pago'), 0)              AS total_recebido,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'atrasado'), 0)          AS total_em_atraso,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status IN ('pendente','atrasado')), 0) AS total_em_aberto,
  CURRENT_DATE - MIN(p.data_vencimento) FILTER (WHERE p.status = 'atrasado') AS dias_em_atraso,
  MIN(p.data_vencimento) FILTER (WHERE p.status IN ('pendente','atrasado'))   AS proxima_vencimento
FROM alunos a
LEFT JOIN turmas    t ON a.turma_id = t.id
LEFT JOIN pagamentos p ON a.id = p.aluno_id
GROUP BY a.id, t.nome, t.valor_mensalidade;

-- 6. Função para rodar diariamente (pode ser chamada por cron/edge function)
CREATE OR REPLACE FUNCTION sincronizar_inadimplencia()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Marca pagamentos vencidos
  UPDATE pagamentos SET status = 'atrasado'
  WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE;

  -- Marca alunos inadimplentes
  UPDATE alunos SET status = 'inadimplente'
  WHERE status = 'ativo' AND id IN (
    SELECT DISTINCT aluno_id FROM pagamentos WHERE status = 'atrasado'
  );

  -- Volta alunos que quitaram tudo para ativo
  UPDATE alunos SET status = 'ativo'
  WHERE status = 'inadimplente' AND id NOT IN (
    SELECT DISTINCT aluno_id FROM pagamentos WHERE status = 'atrasado'
  );
END;
$$;

-- Executa agora
SELECT sincronizar_inadimplencia();
