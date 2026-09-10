-- "Faturamento realizado por vendedor" (aba Dados): agora bate com o
-- Fechamento/cofrinho. Une:
--   1. alunos.vendedor_id (matrículas no sistema, sem pré-matrícula)
--   2. comissoes_vendedores tipo=comissao SEM matrícula no sistema
--      (ex: Vanderleia -- PNL cobrado por fora, nunca entrou em alunos)
--   dedup por aluno_id pra não contar 2x.
-- A coluna Comissão passa a ser o VALOR REAL somado de
-- comissoes_vendedores (o que foi pro cofrinho), não mais estimativa.
DROP FUNCTION IF EXISTS public.time_comercial_alunos_vendedor();

CREATE FUNCTION public.time_comercial_alunos_vendedor()
RETURNS TABLE(
  vendedor text,
  vista_cartao bigint,
  boleto bigint,
  bolsa_cortesia bigint,
  sem_forma bigint,
  total bigint,
  faturamento numeric,
  comissao_est numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH vendas AS (
    SELECT
      a.vendedor_id AS vendedor,
      a.forma_pagamento,
      a.tipo_pagamento,
      CASE
        WHEN a.tipo_pagamento IN ('bolsa', 'cortesia') THEN 0
        WHEN a.forma_pagamento IN ('avista', 'cartao') THEN coalesce(a.valor_mensalidade, 0) * coalesce(a.total_mensalidades, 1)
        WHEN a.forma_pagamento = 'boleto' THEN coalesce(a.valor_mensalidade, 0)
        ELSE 0
      END AS faturamento
    FROM public.alunos a
    WHERE a.vendedor_id IS NOT NULL
      AND coalesce(a.status, '') <> 'pre_matricula'

    UNION ALL

    SELECT
      c.vendedor,
      c.forma_pagamento,
      'mensalidade'::text AS tipo_pagamento,
      coalesce(c.valor_venda, 0) AS faturamento
    FROM public.comissoes_vendedores c
    WHERE c.tipo = 'comissao'
      AND (
        c.aluno_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.alunos a2
          WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL
            AND coalesce(a2.status, '') <> 'pre_matricula'
        )
      )
  ),
  comissao_real AS (
    SELECT vendedor, sum(coalesce(valor_comissao, 0)) AS total
    FROM public.comissoes_vendedores
    WHERE tipo = 'comissao'
    GROUP BY vendedor
  )
  SELECT
    v.vendedor,
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento IN ('avista', 'cartao')) AS vista_cartao,
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento = 'boleto') AS boleto,
    count(*) FILTER (WHERE v.tipo_pagamento IN ('bolsa', 'cortesia')) AS bolsa_cortesia,
    count(*) FILTER (WHERE v.forma_pagamento IS NULL AND v.tipo_pagamento = 'mensalidade') AS sem_forma,
    count(*) AS total,
    coalesce(sum(v.faturamento), 0) AS faturamento,
    coalesce(max(cr.total), 0) AS comissao_est
  FROM vendas v
  LEFT JOIN comissao_real cr ON cr.vendedor = v.vendedor
  GROUP BY v.vendedor;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_alunos_vendedor() TO authenticated;
