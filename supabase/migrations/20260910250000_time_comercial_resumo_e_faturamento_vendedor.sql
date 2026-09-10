-- Visão geral da aba Dados na ótica do vendedor + faturamento/comissão reais.

-- 1) Resumo do vendedor: leads que ele REALMENTE trabalhou (pegou/contactou,
--    contando a base de retorno), e vendas incluindo pré-matrícula.
CREATE OR REPLACE FUNCTION public.time_comercial_resumo_vendedor()
RETURNS TABLE(vendedor text, leads_trabalhados bigint, vendas bigint, pre_matriculas bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH trab AS (
    SELECT h.vendedor, count(DISTINCT h.lead_id) AS n
    FROM public.leads_historico_fase h
    WHERE h.vendedor IS NOT NULL
      AND h.origem_mudanca IN ('atribuicao', 'contato_whatsapp', 'contato_ligacao')
    GROUP BY h.vendedor
  ),
  vend AS (
    SELECT a.vendedor_id AS vendedor,
           count(*) AS n,
           count(*) FILTER (WHERE a.status = 'pre_matricula') AS npre
    FROM public.alunos a
    WHERE a.vendedor_id IS NOT NULL
    GROUP BY a.vendedor_id
  )
  SELECT
    coalesce(t.vendedor, v.vendedor) AS vendedor,
    coalesce(t.n, 0) AS leads_trabalhados,
    coalesce(v.n, 0) AS vendas,
    coalesce(v.npre, 0) AS pre_matriculas
  FROM trab t
  FULL OUTER JOIN vend v ON v.vendedor = t.vendedor;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_resumo_vendedor() TO authenticated;

-- 2) Faturamento realizado por vendedor: agora com faturamento/comissao_est
--    REAIS por venda (antes o front estimava tudo pelo preço padrão de
--    psicanálise, errado pra PNL). Pré-matrícula e bolsa/cortesia fora.
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
  SELECT
    vendedor_id AS vendedor,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento IN ('avista', 'cartao')) AS vista_cartao,
    count(*) FILTER (WHERE tipo_pagamento = 'mensalidade' AND forma_pagamento = 'boleto') AS boleto,
    count(*) FILTER (WHERE tipo_pagamento IN ('bolsa', 'cortesia')) AS bolsa_cortesia,
    count(*) FILTER (WHERE forma_pagamento IS NULL AND tipo_pagamento = 'mensalidade') AS sem_forma,
    count(*) AS total,
    coalesce(sum(
      CASE
        WHEN tipo_pagamento IN ('bolsa', 'cortesia') THEN 0
        WHEN forma_pagamento IN ('avista', 'cartao') THEN coalesce(valor_mensalidade, 0) * coalesce(total_mensalidades, 1)
        WHEN forma_pagamento = 'boleto' THEN coalesce(valor_mensalidade, 0)
        ELSE 0
      END
    ), 0) AS faturamento,
    coalesce(sum(
      CASE
        WHEN tipo_pagamento IN ('bolsa', 'cortesia') THEN 0
        WHEN forma_pagamento IN ('avista', 'cartao') THEN coalesce(valor_mensalidade, 0) * coalesce(total_mensalidades, 1) * 0.10
        WHEN forma_pagamento = 'boleto' THEN coalesce(valor_mensalidade, 0) * 0.50
        ELSE 0
      END
    ), 0) AS comissao_est
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL
    AND coalesce(status, '') <> 'pre_matricula'
  GROUP BY vendedor_id;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_alunos_vendedor() TO authenticated;
