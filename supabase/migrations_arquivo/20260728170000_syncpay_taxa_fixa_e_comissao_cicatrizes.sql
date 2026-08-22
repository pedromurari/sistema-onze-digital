-- Valor fixo (R$) de taxa cobrada pela SyncPay por venda -- o Pix da Sync e
-- taxa progressiva por faixa de valor da venda, nao percentual (confirmado
-- no painel deles: ate R$100 = R$0,00 hoje). Editavel por produto, ja que
-- a faixa pode mudar dependendo do preco do produto.
ALTER TABLE parceiros_produtos ADD COLUMN IF NOT EXISTS syncpay_taxa_fixa numeric DEFAULT 0;

-- Coproducao real do Cicatrizes que Curam ja configurada na propria SyncPay: 50/50.
UPDATE parceiros_produtos
SET comissao_idm_pct = 50, comissao_parceiro_pct = 50
WHERE id = 'd465a72c-d328-4e92-b158-40d5b9a6fab6';
