-- Pedido do dono do produto (2026-11-12): igual o link do Asaas, a
-- vendedora precisa poder copiar/abrir o link do contrato (Autentique)
-- direto na tabela de Minhas Vendas, sem depender só do envio automático
-- (WhatsApp do financeiro) ou do e-mail.
DROP FUNCTION IF EXISTS public.time_comercial_minhas_vendas();

CREATE FUNCTION public.time_comercial_minhas_vendas()
 RETURNS TABLE(aluno_id uuid, aluno_nome text, produto text, forma_pagamento text, valor_parcela numeric, num_parcelas integer, valor_total numeric, status text, origem text, data_venda date, vendedor text, contrato_assinado boolean, contrato_enviado boolean, data_registro date, data_venda_concretizada date, link_pagamento_asaas text, link_contrato text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
BEGIN
  RETURN QUERY
  SELECT a.id, a.nome, a.produto, a.forma_pagamento, a.valor_mensalidade, a.total_mensalidades,
    coalesce((SELECT sum(p.valor - coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.status = 'pago'), 0),
    a.status, 'matricula'::text, a.data_matricula, a.vendedor_id,
    coalesce(a.contrato_assinado, false), coalesce(a.contrato_enviado, false),
    (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
    (SELECT p.data_pagamento FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.numero_parcela = 1 AND p.status = 'pago' LIMIT 1),
    (SELECT p.link_pagamento_asaas FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.numero_parcela = 1 LIMIT 1),
    a.autentique_link_assinatura
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL AND (v_admin OR a.vendedor_id = v_nome)

  UNION ALL

  SELECT c.aluno_id, c.aluno_nome, c.produto, c.forma_pagamento, NULL::numeric, NULL::integer,
    c.valor_venda - coalesce((SELECT sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = c.aluno_id AND p.status = 'pago'), 0),
    c.status::text, 'registro'::text, c.data_venda, c.vendedor, NULL::boolean, NULL::boolean,
    c.data_venda, c.data_venda,
    (SELECT p.link_pagamento_asaas FROM public.pagamentos p WHERE p.aluno_id = c.aluno_id AND p.numero_parcela = 1 LIMIT 1),
    (SELECT a3.autentique_link_assinatura FROM public.alunos a3 WHERE a3.id = c.aluno_id)
  FROM public.comissoes_vendedores c
  WHERE c.tipo = 'comissao' AND (v_admin OR c.vendedor = v_nome)
    AND c.aluno_nome NOT LIKE 'Pagamento de comissões —%'
    AND (c.aluno_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.alunos a2 WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL AND (v_admin OR a2.vendedor_id = v_nome)))
  ORDER BY 10 DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_minhas_vendas() TO authenticated;
