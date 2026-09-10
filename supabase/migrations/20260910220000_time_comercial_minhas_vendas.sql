-- "Minhas Vendas" -- lista nominal das vendas de cada vendedor(a) pra
-- aparecer na aba Dados do CRM Time Comercial. Pedido do dono do produto:
-- Helen/Miguel precisam ver a própria planilha de vendas (nome do aluno,
-- produto, valor), sem os números de comissão/soma (esses continuam só no
-- painel "Fechamento Comissão" do Pedro).
--
-- Fonte: alunos.vendedor_id. Cobre psicanálise, PNL e pré-matrícula -- tudo
-- que estiver atribuído ao vendedor no sistema. Não expõe valor_comissao.
--
-- Escopo: admin/gestor vê todos; vendedor(a) vê só as próprias (casado por
-- profiles.nome = alunos.vendedor_id, que é como o resto do CRM Time
-- Comercial já resolve o vendedor).
CREATE OR REPLACE FUNCTION public.time_comercial_minhas_vendas()
RETURNS TABLE (
  aluno_id uuid,
  aluno_nome text,
  produto text,
  forma_pagamento text,
  valor_parcela numeric,
  num_parcelas integer,
  valor_total numeric,
  status text,
  origem text,
  data_venda date,
  vendedor text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.nome,
    a.produto,
    a.forma_pagamento,
    a.valor_mensalidade,
    a.total_mensalidades,
    CASE
      WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado')
        THEN a.valor_mensalidade * COALESCE(a.total_mensalidades, 1)
      ELSE a.valor_mensalidade
    END,
    a.status,
    a.origem_lead,
    a.data_matricula,
    a.vendedor_id
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR a.vendedor_id = (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid())
    )
  ORDER BY a.data_matricula DESC NULLS LAST, a.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_minhas_vendas() TO authenticated;

COMMENT ON FUNCTION public.time_comercial_minhas_vendas() IS
  'Lista nominal de vendas por vendedor (aba Dados do CRM Time Comercial). Fonte: alunos.vendedor_id. Admin/gestor vê todas; vendedor vê só as próprias. NÃO retorna valor de comissão.';
