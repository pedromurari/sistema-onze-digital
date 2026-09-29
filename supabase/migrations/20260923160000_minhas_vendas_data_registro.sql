-- "Minhas Vendas" (Time Comercial): nova coluna data_registro = dia em que a
-- venda/pre-matricula foi de fato feita (alunos.created_at, horario de
-- Brasilia). A coluna data_venda que ja existia continua igual (nas linhas
-- 'matricula' e alunos.data_matricula, ou seja, a data programada do
-- pagamento -- na pre-matricula e uma data futura); o front passa a chamar
-- essa de "Pagamento previsto". Nas linhas 'registro' (fechamento) a data
-- da venda ja e c.data_venda, entao data_registro = c.data_venda.
-- Assinatura do retorno mudou (coluna nova no fim), por isso DROP + CREATE.
DROP FUNCTION IF EXISTS public.time_comercial_minhas_vendas();

CREATE FUNCTION public.time_comercial_minhas_vendas()
RETURNS TABLE(aluno_id uuid, aluno_nome text, produto text, forma_pagamento text, valor_parcela numeric, num_parcelas integer, valor_total numeric, status text, origem text, data_venda date, vendedor text, contrato_assinado boolean, contrato_enviado boolean, data_registro date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
BEGIN
  RETURN QUERY
  SELECT a.id, a.nome, a.produto, a.forma_pagamento, a.valor_mensalidade, a.total_mensalidades,
    CASE
      WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado', 'avista') THEN
        coalesce((SELECT sum(p.valor) - sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago'),
          a.valor_mensalidade * COALESCE(a.total_mensalidades, 1))
      ELSE a.valor_mensalidade - coalesce((SELECT p.taxa_valor FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago' ORDER BY p.numero_parcela LIMIT 1), 0)
    END,
    a.status, 'matricula'::text, a.data_matricula, a.vendedor_id,
    coalesce(a.contrato_assinado, false), coalesce(a.contrato_enviado, false),
    (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL AND (v_admin OR a.vendedor_id = v_nome)

  UNION ALL

  SELECT c.aluno_id, c.aluno_nome, c.produto, c.forma_pagamento, NULL::numeric, NULL::integer,
    c.valor_venda - coalesce((SELECT sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = c.aluno_id AND p.status = 'pago'), 0),
    c.status::text, 'registro'::text, c.data_venda, c.vendedor, NULL::boolean, NULL::boolean,
    c.data_venda
  FROM public.comissoes_vendedores c
  WHERE c.tipo = 'comissao' AND (v_admin OR c.vendedor = v_nome)
    AND (c.aluno_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.alunos a2 WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL AND (v_admin OR a2.vendedor_id = v_nome)))
  ORDER BY 10 DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_minhas_vendas() TO authenticated;
