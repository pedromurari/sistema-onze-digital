-- "Minhas Vendas" (Time Comercial): coluna Valor passa a mostrar o valor da
-- venda JA sem a taxa de gateway (Asaas/MP): boleto = 1a parcela paga - taxa;
-- cartao/avista = total efetivamente pago - taxa. Venda ainda nao paga
-- (pre-matricula) segue mostrando o bruto, porque ainda nao existe taxa.
-- Cartao tambem deixa de usar mensalidade x total_mensalidades (dava R$150 pra
-- venda de R$1.800 da Marisa). Linhas 'registro' (fechamento) ficam como estavam.
CREATE OR REPLACE FUNCTION public.time_comercial_minhas_vendas()
RETURNS TABLE(aluno_id uuid, aluno_nome text, produto text, forma_pagamento text, valor_parcela numeric, num_parcelas integer, valor_total numeric, status text, origem text, data_venda date, vendedor text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role)
                  OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
BEGIN
  RETURN QUERY
  SELECT
    a.id, a.nome, a.produto, a.forma_pagamento, a.valor_mensalidade, a.total_mensalidades,
    CASE
      WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado', 'avista') THEN
        coalesce(
          (SELECT sum(p.valor) - sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p
            WHERE p.aluno_id = a.id AND p.status = 'pago'),
          a.valor_mensalidade * COALESCE(a.total_mensalidades, 1))
      ELSE
        a.valor_mensalidade - coalesce(
          (SELECT p.taxa_valor FROM public.pagamentos p
            WHERE p.aluno_id = a.id AND p.status = 'pago'
            ORDER BY p.numero_parcela LIMIT 1), 0)
    END,
    a.status, 'matricula'::text, a.data_matricula, a.vendedor_id
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL
    AND (v_admin OR a.vendedor_id = v_nome)

  UNION ALL

  SELECT
    c.aluno_id, c.aluno_nome, c.produto, c.forma_pagamento,
    NULL::numeric, NULL::integer, c.valor_venda, c.status::text,
    'registro'::text, c.data_venda, c.vendedor
  FROM public.comissoes_vendedores c
  WHERE c.tipo = 'comissao'
    AND (v_admin OR c.vendedor = v_nome)
    AND (
      c.aluno_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.alunos a2
        WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL
          AND (v_admin OR a2.vendedor_id = v_nome)
      )
    )
  ORDER BY 10 DESC NULLS LAST;
END;
$function$;

-- Segunda etapa (mesmo dia): coluna Contrato (assinado/enviado) espelhando alunos.
-- Assinatura do retorno mudou, por isso DROP + CREATE; corpo igual ao acima com
-- contrato_assinado e contrato_enviado no fim do SELECT (NULL nas linhas 'registro').
-- Versao aplicada em producao: migration minhas_vendas_coluna_contrato.
