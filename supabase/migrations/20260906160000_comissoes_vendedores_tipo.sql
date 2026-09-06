-- O painel de fechamento (comissoes_vendedores) passou a cobrir tambem
-- outros pagamentos ao vendedor alem de comissao de venda -- ex: ajuda de
-- custo mensal (fixo pago via PIX direto, ver AJUDA_CUSTO em
-- src/lib/vendedores.ts). Adiciona `tipo` pra distinguir na tela sem
-- reaproveitar silenciosamente as colunas de venda (produto/forma_pagamento
-- ficam NULL pra esses lancamentos).
ALTER TABLE public.comissoes_vendedores
  ADD COLUMN tipo text NOT NULL DEFAULT 'comissao' CHECK (tipo IN ('comissao', 'ajuda_custo', 'outro'));

COMMENT ON COLUMN public.comissoes_vendedores.tipo IS
  'comissao = venda fechada; ajuda_custo = pagamento fixo mensal; outro = qualquer lancamento avulso.';
COMMENT ON COLUMN public.comissoes_vendedores.aluno_nome IS
  'Nome do aluno pra tipo=comissao; descricao livre do lancamento pra ajuda_custo/outro (ex: "Ajuda de custo -- retroativo 24 a 31/08").';
