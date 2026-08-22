-- Campo para guardar o link de checkout do produto gerado na Sync Pay.
-- Cadastro manual por enquanto; sem integracao automatica com a API da Sync Pay ainda.

ALTER TABLE parceiros_produtos
  ADD COLUMN IF NOT EXISTS checkout_link_syncpay TEXT;
