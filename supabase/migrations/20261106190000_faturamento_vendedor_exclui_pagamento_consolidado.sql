-- As linhas "Pagamento de comissões — <mês>" em comissoes_vendedores (tipo
-- 'comissao', aluno_id nulo) sao so um resumo informativo do Pix consolidado
-- que ja cobre outras linhas de comissao venda-por-venda (pedido do Pedro
-- 06/11/2026, mesmo padrao visual da linha de ajuda de custo). Sem esse
-- filtro elas contavam 2x no "Dados" do Time Comercial (faturamento e
-- comissao_est): a mesma grana aparecia na venda individual E na linha
-- consolidada. ComissoesFechamento.tsx ja tinha esse mesmo filtro aplicado
-- so no total do painel de fechamento -- aqui aplica o mesmo princípio pra
-- quem le comissoes_vendedores direto via RPC.
CREATE OR REPLACE FUNCTION public.time_comercial_alunos_vendedor(p_mes text DEFAULT NULL::text)
RETURNS TABLE(
  vendedor text, vista_cartao bigint, boleto bigint, bolsa_cortesia bigint,
  sem_forma bigint, total bigint, faturamento numeric, comissao_est numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH vendas AS (
    SELECT
      a.vendedor_id AS vendedor, a.forma_pagamento, a.tipo_pagamento,
      CASE
        WHEN a.tipo_pagamento IN ('bolsa', 'cortesia') THEN 0
        WHEN a.forma_pagamento IN ('avista', 'cartao') THEN coalesce(
          (SELECT sum(p.valor) - sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago'),
          coalesce(a.valor_mensalidade, 0) * coalesce(a.total_mensalidades, 1))
        WHEN a.forma_pagamento = 'boleto' THEN coalesce(a.valor_mensalidade, 0) - coalesce(
          (SELECT p.taxa_valor FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago' ORDER BY p.numero_parcela LIMIT 1), 0)
        ELSE 0
      END AS faturamento
    FROM public.alunos a
    WHERE a.vendedor_id IS NOT NULL AND coalesce(a.status, '') <> 'pre_matricula'
      AND (p_mes IS NULL OR to_char(a.data_matricula, 'YYYY-MM') = p_mes)
      AND (
        a.tipo_pagamento IN ('bolsa', 'cortesia')
        OR EXISTS (SELECT 1 FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.numero_parcela = 1 AND p.status = 'pago')
      )

    UNION ALL

    SELECT c.vendedor, c.forma_pagamento, 'mensalidade'::text,
      coalesce(c.valor_venda, 0) - coalesce((SELECT sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = c.aluno_id AND p.status = 'pago'), 0)
    FROM public.comissoes_vendedores c
    WHERE c.tipo = 'comissao'
      AND c.aluno_nome NOT LIKE 'Pagamento de comissões —%'
      AND (c.aluno_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.alunos a2 WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL AND coalesce(a2.status, '') <> 'pre_matricula'))
      AND (p_mes IS NULL OR to_char(c.data_venda, 'YYYY-MM') = p_mes)
  ),
  comissao_real AS (
    SELECT vendedor, sum(coalesce(valor_comissao, 0)) AS total
    FROM public.comissoes_vendedores
    WHERE tipo = 'comissao'
      AND aluno_nome NOT LIKE 'Pagamento de comissões —%'
      AND (p_mes IS NULL OR to_char(data_venda, 'YYYY-MM') = p_mes)
    GROUP BY vendedor
  )
  SELECT v.vendedor,
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento IN ('avista', 'cartao')),
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento = 'boleto'),
    count(*) FILTER (WHERE v.tipo_pagamento IN ('bolsa', 'cortesia')),
    count(*) FILTER (WHERE v.forma_pagamento IS NULL AND v.tipo_pagamento = 'mensalidade'),
    count(*), coalesce(sum(v.faturamento), 0), coalesce(max(cr.total), 0)
  FROM vendas v LEFT JOIN comissao_real cr ON cr.vendedor = v.vendedor GROUP BY v.vendedor;
$function$;
