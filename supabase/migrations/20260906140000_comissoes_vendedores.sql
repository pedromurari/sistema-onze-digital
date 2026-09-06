-- Painel de fechamento de comissao dos vendedores (Helen/Miguel) -- pedido
-- explicito do dono do produto (2026-09-06): "preciso de um painel...
-- visivel para o financeiro (no caso pra mim).. para quando chegar no dia
-- 30 e for pagar eles.. ter cada venda anotada certinha.. com a comissao
-- correta". Cobre TANTO vendas com comissao automatica (psicanalise:
-- padrao ja calculado por src/lib/vendedores.ts, R$147 avista/cartao 12x,
-- R$75 50% da 1a parcela recorrente/boleto) QUANTO vendas sem formula
-- fechada ainda (PNL Practitioner/Master, preco negociado -- confirmado
-- pelo dono do produto que tambem e 10% do LIQUIDO, ex: venda de R$497 no
-- cartao rendeu R$472,24 liquido = R$47,22 de comissao).
--
-- status: 'pendente' (ainda nao separado), 'reservado' (dinheiro ja
-- transferido pro "cofrinho" do Mercado Pago da empresa, ainda nao pago
-- pro vendedor -- estado real usado pelo dono do produto desde o dia 1
-- de uso), 'pago' (repassado ao vendedor).
--
-- Populada por duas vias: sincronizacao automatica (RPC
-- comissoes_sincronizar_vendas, le `alunos` e cria rascunhos com valor
-- sugerido) + edicao manual direta (ajustar valor real apos conferir o
-- liquido no Mercado Pago, marcar status, anotar observacoes).
--
-- Acesso restrito ao Pedro (gestor, pdrmurari@gmail.com) -- pedido
-- explicito "somente eu posso conseguir ver". RLS trava por auth.uid(),
-- nao so por role, porque hoje so o Pedro tem o papel 'gestor' mas roles
-- podem ganhar mais gente no futuro sem que isso deva abrir este painel.

CREATE TABLE public.comissoes_vendedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor text NOT NULL,
  aluno_id uuid REFERENCES public.alunos(id) ON DELETE SET NULL,
  aluno_nome text NOT NULL,
  produto text,
  forma_pagamento text,
  valor_venda numeric NOT NULL DEFAULT 0,
  valor_comissao numeric NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('auto', 'manual')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'reservado', 'pago')),
  data_venda date NOT NULL DEFAULT current_date,
  data_pagamento date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id)
);

CREATE INDEX idx_comissoes_vendedores_vendedor ON public.comissoes_vendedores (vendedor, data_venda);

ALTER TABLE public.comissoes_vendedores ENABLE ROW LEVEL SECURITY;

-- Restrito ao Pedro (id fixo do profile) -- dado sensivel de folha de
-- pagamento, nao e um recurso coberto pela matriz de permissoes hoje.
CREATE POLICY comissoes_vendedores_somente_pedro ON public.comissoes_vendedores
  FOR ALL
  USING (auth.uid() = '5ef08f96-4813-44e2-99ae-ddb289d72566'::uuid)
  WITH CHECK (auth.uid() = '5ef08f96-4813-44e2-99ae-ddb289d72566'::uuid);

CREATE TRIGGER comissoes_vendedores_set_updated_at
  BEFORE UPDATE ON public.comissoes_vendedores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Sincroniza vendas novas de alunos (time_comercial + pnl_manual) que
-- ainda nao tem linha de comissao. Sugere valor_comissao automaticamente
-- so pra psicanalise em preco padrao (R$1500/R$150 -- os unicos valores
-- com formula 100% confirmada); todo o resto entra com sugestao=0 pra nao
-- arriscar um numero errado -- o Pedro confere e preenche pela venda real
-- (ex: liquido do Mercado Pago) direto na tela.
CREATE OR REPLACE FUNCTION public.comissoes_sincronizar_vendas()
RETURNS TABLE(inseridos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.uid() IS DISTINCT FROM '5ef08f96-4813-44e2-99ae-ddb289d72566'::uuid THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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
      -- valor_venda: total da compra no cartao parcelado (uma cobranca so,
      -- dividida em N vezes) ou o valor cheio a vista; pra recorrente/boleto,
      -- o valor da 1a parcela (base da comissao de 50%, nao o contrato todo).
      CASE
        WHEN a.forma_pagamento IN ('cartao', 'cartao_parcelado') THEN a.valor_mensalidade * COALESCE(a.total_mensalidades, 1)
        ELSE a.valor_mensalidade
      END,
      -- sugestao automatica so pro preco padrao da psicanalise (unica
      -- formula 100% fechada ate agora) -- os demais casos (promo, 997,
      -- PNL) entram com 0, o Pedro preenche apos conferir o liquido real.
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
      AND NOT EXISTS (SELECT 1 FROM public.comissoes_vendedores c WHERE c.aluno_id = a.id)
    ON CONFLICT (aluno_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM novas;

  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.comissoes_sincronizar_vendas() TO authenticated;

COMMENT ON TABLE public.comissoes_vendedores IS
  'Fechamento de comissao dos vendedores (Helen/Miguel) -- psicanalise + PNL. Acesso restrito ao Pedro via RLS. status: pendente/reservado (no cofrinho MP)/pago.';
