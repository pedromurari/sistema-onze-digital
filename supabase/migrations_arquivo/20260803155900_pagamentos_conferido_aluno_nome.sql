-- ================================================================
-- Fechamento precisa mostrar o nome do aluno em cada entrada (não só a
-- turma) e permitir "confirmar" cada pagamento durante a revisão do
-- período, do mesmo jeito que já existe pra matrículas novas.
-- ================================================================

ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMPTZ;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS conferido_por TEXT;

COMMENT ON COLUMN public.pagamentos.conferido_em IS
  'Marcado quando o pagamento é conferido/confirmado na tela de Fechamento da Balanço (revisão do período).';

CREATE OR REPLACE VIEW public.vw_receita_por_fonte AS
SELECT
  p.id,
  p.aluno_id,
  p.turma_id,
  p.valor,
  p.status,
  p.data_pagamento,
  p.mes_referencia,
  p.numero_parcela,
  p.produto,
  COALESCE(a.forma_pagamento, 'boleto')               AS forma_pagamento,
  CASE p.produto
    WHEN 'psicanalise' THEN 'PSI'
    WHEN 'npa'         THEN 'NPA'
    WHEN 'numerologia' THEN 'NPA'
    ELSE COALESCE(pr.nome, COALESCE(p.produto, 'Outro'))
  END                                                 AS produto_label,
  p.canal_cobranca,
  a.nome                                              AS aluno_nome,
  p.conferido_em,
  p.conferido_por
FROM public.pagamentos  p
LEFT JOIN public.alunos   a  ON a.id   = p.aluno_id
LEFT JOIN public.produtos pr ON pr.slug = p.produto
WHERE p.status        = 'pago'
  AND p.data_pagamento IS NOT NULL;
