-- Link da pagina de vendas (landing page), separado do link de checkout Sync Pay,
-- pra aparecer junto na aba Links do CRM.

ALTER TABLE parceiros_produtos ADD COLUMN IF NOT EXISTS pagina_vendas_url TEXT;
