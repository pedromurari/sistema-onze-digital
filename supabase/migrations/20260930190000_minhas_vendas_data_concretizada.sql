-- "Minhas Vendas" (Time Comercial): terceira coluna de data, pedida pelo dono
-- porque "Data da venda" (created_at da pré-matrícula) estava sendo confundida
-- com "a venda de fato aconteceu" -- uma pré-matrícula recém-criada nunca foi
-- paga ainda, mas aparecia com uma "data da venda" preenchida, dando a entender
-- que já virou venda de verdade.
--
-- Agora são três datas, cada uma com um sentido:
--   data_registro            = quando a pré-matrícula/matrícula foi CRIADA no sistema
--                               (renomeada no front pra "Pré-matrícula feita em")
--   data_venda_concretizada  = quando o pagamento de verdade da 1ª parcela caiu
--                               (NULL enquanto for só pré-matrícula sem pagamento)
--   data_venda                = a data PROGRAMADA de cobrança (renomeada no front
--                               pra "Pagamento previsto")
-- Junto: "valor_total" (a coluna "Valor" da tabela) estava inconsistente --
-- cartão/à vista já somava o líquido de TODAS as parcelas pagas (valor - taxa),
-- mas boleto calculava só "valor_mensalidade - taxa da 1ª parcela paga", que não
-- é nem o total do plano nem o líquido acumulado de verdade -- e pré-matrícula
-- sem nada pago ainda mostrava o valor cheio da parcela (R$150), dando a entender
-- que já tinha caído dinheiro, quando na real nada foi recebido. Como essa coluna
-- alimenta o cálculo de comissão (dono: "é esse valor que é feito o cálculo da
-- comissão dela"), agora é sempre a MESMA fórmula pra qualquer forma de
-- pagamento: soma do líquido (valor - taxa) de toda parcela já paga. Pré-
-- matrícula sem pagamento nenhum mostra R$0 -- correto, não tem comissão sobre
-- nada ainda.
--
-- Assinatura muda (coluna nova no fim), por isso DROP + CREATE.
DROP FUNCTION IF EXISTS public.time_comercial_minhas_vendas();

CREATE FUNCTION public.time_comercial_minhas_vendas()
RETURNS TABLE(aluno_id uuid, aluno_nome text, produto text, forma_pagamento text, valor_parcela numeric, num_parcelas integer, valor_total numeric, status text, origem text, data_venda date, vendedor text, contrato_assinado boolean, contrato_enviado boolean, data_registro date, data_venda_concretizada date)
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
    (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
    (SELECT p.data_pagamento FROM public.pagamentos p WHERE p.aluno_id = a.id AND p.numero_parcela = 1 AND p.status = 'pago' LIMIT 1)
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL AND (v_admin OR a.vendedor_id = v_nome)

  UNION ALL

  SELECT c.aluno_id, c.aluno_nome, c.produto, c.forma_pagamento, NULL::numeric, NULL::integer,
    c.valor_venda - coalesce((SELECT sum(coalesce(p.taxa_valor, 0)) FROM public.pagamentos p WHERE p.aluno_id = c.aluno_id AND p.status = 'pago'), 0),
    c.status::text, 'registro'::text, c.data_venda, c.vendedor, NULL::boolean, NULL::boolean,
    c.data_venda, c.data_venda
  FROM public.comissoes_vendedores c
  WHERE c.tipo = 'comissao' AND (v_admin OR c.vendedor = v_nome)
    AND (c.aluno_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.alunos a2 WHERE a2.id = c.aluno_id AND a2.vendedor_id IS NOT NULL AND (v_admin OR a2.vendedor_id = v_nome)))
  ORDER BY 10 DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_minhas_vendas() TO authenticated;
