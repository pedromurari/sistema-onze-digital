-- Corrige bug grave achado pelo dono do produto (2026-11-12): a Monique
-- Barreto Sampaio teve comissão gerada e PAGA pra Helen Magna (R$74, Pix
-- 01/11/2026) sem nunca ter pago nenhuma parcela de verdade -- no Asaas
-- todas as 15 parcelas dela seguem PENDING/OVERDUE. A ficha dela tem
-- mensalidades_pagas=0 hoje e a linha de pagamentos nunca foi tocada desde
-- a criação, então o contador `alunos.mensalidades_pagas` não é confiável
-- o bastante pra sozinho liberar pagamento de comissão.
--
-- Além disso a condição `origem_lead = 'pnl_manual'` liberava comissão
-- incondicionalmente, sem checar pagamento nenhum -- um buraco real, só
-- não explodiu ainda porque os alunos pnl_manual existentes já tinham
-- mensalidade paga de verdade.
--
-- Fix: em vez de confiar em `alunos.mensalidades_pagas` (cache que pode
-- dessincronizar) ou liberar geral pra pnl_manual, exige evidência real na
-- tabela `pagamentos` (status='pago', pelo menos 1 parcela) pra qualquer
-- forma de pagamento que passe por ela. avista/cartão (à vista) continuam
-- avaliando mp_status='approved' na própria linha do aluno, que é a fonte
-- de verdade desse caminho (não passa por `pagamentos`).
CREATE OR REPLACE FUNCTION public.comissoes_sincronizar_vendas_auto()
RETURNS TABLE(inseridos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
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
        (a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.mp_status = 'approved')
        OR (
          a.forma_pagamento IN ('cartao_recorrente', 'boleto')
          AND EXISTS (
            SELECT 1 FROM public.pagamentos p
            WHERE p.aluno_id = a.id AND p.status = 'pago'
          )
        )
      )
      AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.aluno_id = a.id)
    ON CONFLICT (aluno_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM novas;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.comissoes_sincronizar_vendas_auto() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.comissoes_sincronizar_vendas_auto() TO service_role;

-- Mesma correção na versão manual (botão "Buscar novas vendas", travada por
-- auth.uid() = Pedro).
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
        (a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.mp_status = 'approved')
        OR (
          a.forma_pagamento IN ('cartao_recorrente', 'boleto')
          AND EXISTS (
            SELECT 1 FROM public.pagamentos p
            WHERE p.aluno_id = a.id AND p.status = 'pago'
          )
        )
      )
      AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.aluno_id = a.id)
    ON CONFLICT (aluno_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM novas;

  RETURN QUERY SELECT v_count;
END;
$$;
