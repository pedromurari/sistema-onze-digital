-- Percentual de desconto que o cupom da ao comprador (ate agora so existia
-- comissao_pct, que e o ganho da afiliada -- faltava o desconto em si).

ALTER TABLE parceiros_cupons ADD COLUMN IF NOT EXISTS desconto_pct numeric;
