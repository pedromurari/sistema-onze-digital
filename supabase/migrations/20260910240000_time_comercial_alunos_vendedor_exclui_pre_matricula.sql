-- "Faturamento realizado por vendedor" (aba Dados) só deve contar matrícula
-- efetivada. Pré-matrícula (status pre_matricula, entrada ainda não paga)
-- não é venda realizada -- estava inflando a contagem por método de
-- pagamento do vendedor.
CREATE OR REPLACE FUNCTION public.time_comercial_alunos_vendedor()
RETURNS TABLE(vendedor text, vista_cartao bigint, boleto bigint, bolsa_cortesia bigint, sem_forma bigint, total bigint)
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
    count(*) AS total
  FROM public.alunos
  WHERE vendedor_id IS NOT NULL
    AND coalesce(status, '') <> 'pre_matricula'
  GROUP BY vendedor_id;
$function$;
