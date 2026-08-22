-- ================================================================
-- payment_method_rates.produto_slug tem FK pra produtos(slug) e o app usa
-- o valor sentinela '*' pra dizer "essa taxa vale pra qualquer produto"
-- (ver calcTaxaTransacao em financial-utils.ts e o option "Todos (*)" em
-- TaxasPagamentoConfig.tsx). Sem essa linha, salvar uma taxa com Produto =
-- "Todos (*)" sempre falhava com violação de FK (23503) — nunca existiu
-- produtos.slug = '*'. ativo=false pra não aparecer em nenhuma lista de
-- produtos filtrada por ativo=true; existe só pra satisfazer a FK.
-- ================================================================
INSERT INTO public.produtos (nome, slug, cor, ativo, ordem)
VALUES ('Qualquer produto (curinga de taxa)', '*', '#9ca3af', false, 999)
ON CONFLICT (slug) DO NOTHING;
