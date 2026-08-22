-- ================================================================
-- Expõe pagamentos.canal_cobranca na view vw_receita_por_fonte.
-- A coluna foi criada em 20260730210000_canais_cobranca.sql (depois da
-- view original, 20260609_foundation_produtos_taxas.sql) e nunca tinha
-- sido adicionada aqui — sem isso, a Balanço não conseguia mostrar/editar
-- o canal real de cada pagamento na tela de Fechamento.
-- CREATE OR REPLACE VIEW é aditivo: mantém as colunas existentes, só
-- acrescenta canal_cobranca.
-- ================================================================

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
  p.canal_cobranca
FROM public.pagamentos  p
LEFT JOIN public.alunos   a  ON a.id   = p.aluno_id
LEFT JOIN public.produtos pr ON pr.slug = p.produto
WHERE p.status        = 'pago'
  AND p.data_pagamento IS NOT NULL;
