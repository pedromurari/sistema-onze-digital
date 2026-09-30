-- Faturamento por vendedor (aba Dados) já é ao vivo -- lê `alunos` direto, sem
-- passo manual nenhum. A coluna Comissão, porém, vem de `comissoes_vendedores`,
-- que só ganhava linha nova quando alguém clicava "Buscar novas vendas" (chama
-- comissoes_sincronizar_vendas(), travada por auth.uid() = Pedro). Pedido do
-- dono: "toda vez que cai uma venda, tem que atualizar sozinho".
--
-- Solução: uma cópia da mesma função, SEM a trava de auth.uid() (que não faz
-- sentido pra uma chamada automática, sem usuário logado nenhum), exposta só
-- pro service_role -- nunca pro browser (authenticated/anon não tem EXECUTE
-- nela). Um cron (ver função comissoes-sincronizar-cron) chama essa via
-- service role de tempos em tempos.
CREATE OR REPLACE FUNCTION public.comissoes_sincronizar_vendas_auto()
RETURNS TABLE(inseridos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH novas AS (
    INSERT INTO public.comissoes_vendedores (
      vendedor, aluno_id, aluno_nome, produto, forma_pagamento,
      valor_venda, valor_comissao, origem, data_venda
    )
    SELECT
      a.vendedor_id,
      a.id,
      a.nome,
      a.produto,
      a.forma_pagamento,
      CASE
        WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado') THEN a.valor_mensalidade * COALESCE(a.total_mensalidades, 1)
        ELSE a.valor_mensalidade
      END,
      CASE
        WHEN a.produto = 'psicanalise' AND a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.valor_mensalidade = 1500 THEN 147
        WHEN a.produto = 'psicanalise' AND a.forma_pagamento IN ('cartao_recorrente', 'boleto') AND a.valor_mensalidade = 150 THEN 75
        ELSE 0
      END,
      'auto',
      a.data_matricula
    FROM public.alunos a
    WHERE a.vendedor_id IN ('Helen Magna', 'Miguel Fogaça')
      AND a.origem_lead IN ('time_comercial', 'pnl_manual')
      AND a.status = 'ativo'
      AND (
        a.origem_lead = 'pnl_manual'
        OR (a.forma_pagamento IN ('avista', 'cartao', 'cartao_parcelado') AND a.mp_status = 'approved')
        OR (a.forma_pagamento IN ('cartao_recorrente', 'boleto') AND COALESCE(a.mensalidades_pagas, 0) >= 1)
      )
      AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.aluno_id = a.id)
    ON CONFLICT (aluno_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM novas;

  RETURN QUERY SELECT v_count;
END;
$$;

-- Só service_role (o cron/edge function) pode chamar -- nunca authenticated/anon,
-- pra não abrir um jeito de contornar a trava de auth.uid() da versão manual.
REVOKE ALL ON FUNCTION public.comissoes_sincronizar_vendas_auto() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.comissoes_sincronizar_vendas_auto() TO service_role;
