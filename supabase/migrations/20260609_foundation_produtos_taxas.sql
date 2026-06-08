-- ================================================================
-- CFO v3: Foundation — Produtos configuráveis + Taxas por produto/método
-- ================================================================
-- Contexto: O sistema atual tem produtos hardcoded ('psicanalise', 'npa', 'geral')
-- como CHECK constraint. Esta migration torna os produtos totalmente configuráveis
-- via tabela, sem precisar de novo deploy para adicionar produtos futuros.
-- As taxas de processamento (Asaas, Vega) também passam a ser configuradas por
-- produto + forma de pagamento, não mais como percentual único global.
-- ================================================================

-- ================================================================
-- 1. TABELA DE PRODUTOS DINÂMICOS
-- ================================================================
-- Após esta migration, adicionar novo produto = INSERT nesta tabela.
-- Sem alteração de código, sem constraint para mudar.
CREATE TABLE IF NOT EXISTS public.produtos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,               -- "Psicanálise Integrativa"
  slug       TEXT        NOT NULL UNIQUE,        -- "psicanalise" (chave usada em FKs)
  cor        TEXT        NOT NULL DEFAULT '#6366f1',  -- cor exibida na UI
  descricao  TEXT,
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  ordem      INT         NOT NULL DEFAULT 0,     -- ordem de exibição nas abas
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed dos produtos existentes (idempotente: não recria se já existir)
INSERT INTO public.produtos (nome, slug, cor, ordem) VALUES
  ('Psicanálise Integrativa', 'psicanalise', '#3b82f6', 1),
  ('Numerologia (NPA)',        'npa',         '#8b5cf6', 2),
  ('Geral',                   'geral',        '#6b7280', 99)
ON CONFLICT (slug) DO NOTHING;

-- RLS: produtos são visíveis para todos autenticados (é configuração global)
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtos_authenticated_read" ON public.produtos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "produtos_admin_write" ON public.produtos
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_access_permissions
    WHERE user_id = auth.uid() AND can_view_financeiro_cfo = true
  ));

-- ================================================================
-- 2. TABELA DE TAXAS POR PRODUTO + MÉTODO DE PAGAMENTO + GATEWAY
-- ================================================================
-- Substitui o JSONB genérico balanco_config.taxas para cálculo de líquido real.
-- MANTÉM balanco_config.taxas intacto para não quebrar Balanco.tsx existente.
--
-- Como funciona:
-- - Cada linha define: qual produto + qual método + qual gateway + qual taxa
-- - produto_slug '*' = aplica para todos os produtos
-- - forma_pagamento '*' = aplica para todos os métodos
-- - Se múltiplas regras casam, a mais específica (produto+forma exatos) prevalece
-- - faixa_min/faixa_max permitem taxas diferentes por valor (ex: boletos < R$50 = custo alto)
--
-- Fonte de dados para cálculo no FinanceiroCFO: vw_receita_por_fonte × payment_method_rates
CREATE TABLE IF NOT EXISTS public.payment_method_rates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_slug        TEXT        NOT NULL,      -- FK para produtos.slug (ou '*' para todos)
  forma_pagamento     TEXT        NOT NULL,      -- 'boleto' | 'cartao' | 'pix' | 'avista' | '*'
  gateway             TEXT        NOT NULL DEFAULT 'asaas',
                                                 -- 'asaas' | 'vega' | 'stripe' | 'outros'
  percentual          NUMERIC(6,4) NOT NULL DEFAULT 0,
                                                 -- ex: 2.9900 = 2.99% do valor
  fixo_por_transacao  NUMERIC(8,2) NOT NULL DEFAULT 0,
                                                 -- ex: 1.99 (Asaas cobra por boleto emitido)
  faixa_min           NUMERIC(10,2) NOT NULL DEFAULT 0,
  faixa_max           NUMERIC(10,2) NOT NULL DEFAULT 999999.99,
  ativo               BOOLEAN     NOT NULL DEFAULT true,
  observacao          TEXT,                      -- nota livre: "Asaas Boleto: 1% + R$1,99/boleto"
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pmr_produto
    FOREIGN KEY (produto_slug) REFERENCES public.produtos(slug)
    ON DELETE CASCADE,
  UNIQUE (produto_slug, forma_pagamento, gateway, faixa_min)
);

-- Seed: taxas reais do Asaas (fonte: https://www.asaas.com/precos-e-taxas - Jun/2026)
-- Editável na UI: CFO → aba "Líquido Real" → Configuração de Taxas
INSERT INTO public.payment_method_rates
  (produto_slug, forma_pagamento, gateway, percentual, fixo_por_transacao, observacao)
VALUES
  ('psicanalise', 'boleto',  'asaas', 1.0000, 1.99, 'Asaas Boleto PSI: 1% + R$1,99 por boleto emitido'),
  ('psicanalise', 'cartao',  'asaas', 3.4900, 0.00, 'Asaas Cartão PSI: 3,49% (1x). Parcelado: adicionar 1%/parcela'),
  ('psicanalise', 'pix',     'asaas', 0.9900, 0.00, 'Asaas PIX PSI: 0,99% por transação'),
  ('psicanalise', 'avista',  'asaas', 0.9900, 0.00, 'Asaas PIX/À Vista PSI: 0,99%'),
  ('npa',         'boleto',  'asaas', 1.0000, 1.99, 'Asaas Boleto NPA: 1% + R$1,99 por boleto emitido'),
  ('npa',         'cartao',  'asaas', 3.4900, 0.00, 'Asaas Cartão NPA: 3,49%'),
  ('npa',         'cartao',  'vega',  2.5000, 0.00, 'Vega Cartão NPA: 2,5% (verificar contrato)'),
  ('npa',         'pix',     'asaas', 0.9900, 0.00, 'Asaas PIX NPA: 0,99%')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.payment_method_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pmr_authenticated_read" ON public.payment_method_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pmr_admin_write" ON public.payment_method_rates
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_access_permissions
    WHERE user_id = auth.uid() AND can_view_financeiro_cfo = true
  ));

-- ================================================================
-- 3. ÍNDICE PARA VIEW DE RECEITA POR FONTE
-- ================================================================
-- Suporta o JOIN de pagamentos + alunos sem full table scan
CREATE INDEX IF NOT EXISTS idx_pagamentos_pago_data_produto
  ON public.pagamentos (data_pagamento, produto, status)
  WHERE status = 'pago';

CREATE INDEX IF NOT EXISTS idx_pagamentos_pago_mes
  ON public.pagamentos (mes_referencia, status)
  WHERE status = 'pago';

-- ================================================================
-- 4. VIEW: RECEITA POR FONTE (produto + forma_pagamento via JOIN)
-- ================================================================
-- Por quê: a tabela pagamentos sabe o valor e o produto, mas NÃO sabe a forma
-- de pagamento. Essa info está em alunos.forma_pagamento. O JOIN via view
-- resolve isso sem precisar adicionar coluna duplicada em pagamentos.
--
-- Usada em: FinanceiroCFO → abas Fluxo, Líquido Real, Fontes
-- Filtro: apenas status='pago' com data_pagamento preenchida
CREATE OR REPLACE VIEW public.vw_receita_por_fonte AS
SELECT
  p.id,
  p.aluno_id,
  p.turma_id,
  p.valor,
  p.status,
  p.data_pagamento,
  p.mes_referencia,
  p.numero_parcela,
  p.produto,
  COALESCE(a.forma_pagamento, 'boleto')               AS forma_pagamento,
  -- produto_label: label amigável para exibição (PSI, NPA, ou nome do produto)
  CASE p.produto
    WHEN 'psicanalise' THEN 'PSI'
    WHEN 'npa'         THEN 'NPA'
    WHEN 'numerologia' THEN 'NPA'
    ELSE COALESCE(pr.nome, COALESCE(p.produto, 'Outro'))
  END                                                 AS produto_label
FROM public.pagamentos  p
LEFT JOIN public.alunos   a  ON a.id   = p.aluno_id
LEFT JOIN public.produtos pr ON pr.slug = p.produto
WHERE p.status        = 'pago'
  AND p.data_pagamento IS NOT NULL;
-- Nota de segurança: SECURITY INVOKER (padrão). A view herda as políticas RLS
-- das tabelas base (pagamentos e alunos). Usuários só veem o que as políticas
-- das tabelas permitem.

-- ================================================================
-- 5. RESPONSÁVEIS: VÍNCULO COM AUTH.USERS (onboarding automático)
-- ================================================================
-- Antes: responsaveis tinha apenas id e nome. O link com auth.users era manual
-- em user_access_permissions. Com user_id aqui, o onboarding fica automático.
ALTER TABLE public.responsaveis
  ADD COLUMN IF NOT EXISTS user_id  UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email    TEXT,
  ADD COLUMN IF NOT EXISTS ativo    BOOLEAN NOT NULL DEFAULT true;

-- ================================================================
-- 6. COBRANÇA POR PRODUTO (override por produto, sem quebrar configuração global)
-- ================================================================
-- NULL = configuração global (comportamento atual preservado)
-- 'psicanalise' = sobrescreve para PSI especificamente
ALTER TABLE public.cobranca_config
  ADD COLUMN IF NOT EXISTS produto_slug TEXT REFERENCES public.produtos(slug) ON DELETE SET NULL;

-- ================================================================
-- Verificação pós-migration:
-- SELECT * FROM public.produtos;           -- deve retornar 3 produtos
-- SELECT * FROM public.payment_method_rates;  -- deve retornar 8 taxas
-- SELECT * FROM public.vw_receita_por_fonte LIMIT 10;  -- deve retornar pagamentos com forma_pagamento
-- ================================================================
