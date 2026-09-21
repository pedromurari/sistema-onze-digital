-- Faturamento comercial por vendedor (aba Dados do Time Comercial): venda a
-- vista/cartao passa a contar o que foi EFETIVAMENTE pago naquela venda
-- (soma de pagamentos com status pago), e nao valor_mensalidade x
-- total_mensalidades. Motivo: venda unica no cartao parcelado tem UMA linha em
-- pagamentos pelo bruto (ex: Marisa, R$1.800,02), mas total_mensalidades nem
-- sempre reflete as parcelas do cartao -- a conta antiga mostrava R$150 (x1).
-- Faturamento comercial = o que a venda gerou no ato, nao LTV: boleto segue
-- contando so a 1a parcela. Fallback pro calculo antigo se ainda nao ha pago.
CREATE OR REPLACE FUNCTION public.time_comercial_alunos_vendedor()
RETURNS TABLE(
  vendedor text, vista_cartao bigint, boleto bigint, bolsa_cortesia bigint,
  sem_forma bigint, total bigint, faturamento numeric, comissao_est numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH vendas AS (
    SELECT
      a.vendedor_id AS vendedor,
      a.forma_pagamento,
      a.tipo_pagamento,
      CASE
        WHEN a.tipo_pagamento IN ('bolsa', 'cortesia') THEN 0
        WHEN a.forma_pagamento IN ('avista', 'cartao') THEN coalesce(
          (SELECT sum(p.valor) FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago'),
          coalesce(a.valor_mensalidade, 0) * coalesce(a.total_mensalidades, 1))
        WHEN a.forma_pagamento = 'boleto' THEN coalesce(a.valor_mensalidade, 0)
        ELSE 0
      END AS faturamento
    FROM public.alunos a
    WHERE a.vendedor_id IS NOT NULL
      AND coalesce(a.status, '') <> 'pre_matricula'

    UNION ALL

    SELECT c.vendedor, c.forma_pagamento, 'mensalidade'::text, coalesce(c.valor_venda, 0)
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
    FROM public.comissoes_vendedores WHERE tipo = 'comissao' GROUP BY vendedor
  )
  SELECT
    v.vendedor,
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento IN ('avista', 'cartao')),
    count(*) FILTER (WHERE v.tipo_pagamento = 'mensalidade' AND v.forma_pagamento = 'boleto'),
    count(*) FILTER (WHERE v.tipo_pagamento IN ('bolsa', 'cortesia')),
    count(*) FILTER (WHERE v.forma_pagamento IS NULL AND v.tipo_pagamento = 'mensalidade'),
    count(*),
    coalesce(sum(v.faturamento), 0),
    coalesce(max(cr.total), 0)
  FROM vendas v
  LEFT JOIN comissao_real cr ON cr.vendedor = v.vendedor
  GROUP BY v.vendedor;
$function$;

-- Ajuste do mesmo dia (migration faturamento_vendedor_liquido_gateway): faturamento
-- passa a descontar a taxa de gateway -- cartao/avista = total pago - taxa; boleto =
-- 1a parcela - taxa da 1a parcela paga. Linhas 'registro' (fechamento) seguem brutas.
