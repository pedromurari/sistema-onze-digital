-- Ajuste do fix anterior (exige pagamento confirmado): PNL nao passa por
-- gateway automatico nenhum -- o formulario /pnl-contrato (pnl_matricula_criar)
-- so e preenchido DEPOIS que o pagamento ja foi confirmado manualmente por
-- fora (link avulso). Pra esses, mp_status/mensalidades_pagas nunca sao
-- preenchidos (nao ha webhook rastreando essa cobranca), entao exigir
-- qualquer um dos dois excluiria TODA venda de PNL por engano -- pra
-- origem_lead='pnl_manual', status='ativo' ja e prova suficiente.
CREATE OR REPLACE FUNCTION public.comissoes_sincronizar_vendas()
RETURNS TABLE(inseridos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS DISTINCT FROM '5ef08f96-4813-44e2-99ae-ddb289d72566'::uuid THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH novas AS (
    INSERT INTO public.comissoes_vendedores (
      vendedor, aluno_id, aluno_nome, produto, forma_pagamento,
      valor_venda, valor_comissao, origem, data_venda
    )
    SELECT
      a.vendedor_id,
      a.id,
      a.nome,
      a.produto,
      a.forma_pagamento,
      CASE
        WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado') THEN a.valor_mensalidade * COALESCE(a.total_mensalidades, 1)
        ELSE a.valor_mensalidade
      END,
      CASE
        WHEN a.produto = 'psicanalise' AND a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.valor_mensalidade = 1500 THEN 147
        WHEN a.produto = 'psicanalise' AND a.forma_pagamento IN ('cartao_recorrente', 'boleto') AND a.valor_mensalidade = 150 THEN 75
        ELSE 0
      END,
      'auto',
      a.data_matricula
    FROM public.alunos a
    WHERE a.vendedor_id IN ('Helen Magna', 'Miguel Fogaça')
      AND a.origem_lead IN ('time_comercial', 'pnl_manual')
      AND a.status = 'ativo'
      AND (
        a.origem_lead = 'pnl_manual'
        OR (a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.mp_status = 'approved')
        OR (a.forma_pagamento IN ('cartao_recorrente', 'boleto') AND COALESCE(a.mensalidades_pagas, 0) >= 1)
      )
      AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.aluno_id = a.id)
    ON CONFLICT (aluno_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM novas;

  RETURN QUERY SELECT v_count;
END;
$$;
