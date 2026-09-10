-- "Minhas Vendas" -- lista nominal das vendas de cada vendedor(a) pra
-- aparecer na aba Dados do CRM Time Comercial. Pedido do dono do produto:
-- Helen/Miguel precisam ver a própria planilha de vendas (nome do aluno,
-- produto, valor), sem os números de comissão/soma (esses continuam só no
-- painel "Fechamento Comissão" do Pedro).
--
-- Duas fontes, unidas:
--   1. alunos.vendedor_id  -> matrículas no sistema (psicanálise, PNL, pré)
--   2. comissoes_vendedores (tipo='comissao') -> vendas lançadas à mão no
--      fechamento que NÃO têm matrícula no sistema (ex: PNL cobrado por
--      fora, aluno nunca entrou em `alunos`). Dedupe por aluno_id: se a
--      linha de comissão já aponta pra um aluno que veio da fonte 1, não
--      repete.
-- Nenhuma das fontes expõe valor_comissao.
--
-- Escopo: admin/gestor vê todos; vendedor(a) vê só as próprias (casado por
-- profiles.nome, que é como o resto do CRM Time Comercial já resolve o
-- vendedor).
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role)
                  OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
BEGIN
  RETURN QUERY
  -- Fonte 1: matrículas no sistema
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
    'matricula'::text,
    a.data_matricula,
    a.vendedor_id
  FROM public.alunos a
  WHERE a.vendedor_id IS NOT NULL
    AND (v_admin OR a.vendedor_id = v_nome)

  UNION ALL

  -- Fonte 2: vendas lançadas à mão no fechamento, sem matrícula no sistema
  SELECT
    c.aluno_id,
    c.aluno_nome,
    c.produto,
    c.forma_pagamento,
    NULL::numeric,
    NULL::integer,
    c.valor_venda,
    c.status::text,
    'registro'::text,
    c.data_venda,
    c.vendedor
  FROM public.comissoes_vendedores c
  WHERE c.tipo = 'comissao'
    AND (v_admin OR c.vendedor = v_nome)
    AND (
      c.aluno_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.alunos a2
        WHERE a2.id = c.aluno_id
          AND a2.vendedor_id IS NOT NULL
          AND (v_admin OR a2.vendedor_id = v_nome)
      )
    )

  ORDER BY 10 DESC NULLS LAST;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_minhas_vendas() TO authenticated;

COMMENT ON FUNCTION public.time_comercial_minhas_vendas() IS
  'Lista nominal de vendas por vendedor (aba Dados do CRM Time Comercial). Une alunos.vendedor_id + comissoes_vendedores(tipo=comissao) sem matricula, deduplicado por aluno_id. Admin/gestor ve todas; vendedor ve so as proprias. NAO retorna valor de comissao.';
