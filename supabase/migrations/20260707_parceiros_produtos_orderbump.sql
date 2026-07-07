-- Order bump por produto + flags de liberação de acesso pós-compra

ALTER TABLE parceiros_produtos
  ADD COLUMN IF NOT EXISTS bump_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bump_nome varchar,
  ADD COLUMN IF NOT EXISTS bump_descricao text,
  ADD COLUMN IF NOT EXISTS bump_preco numeric,
  ADD COLUMN IF NOT EXISTS integra_seu_numerologo boolean NOT NULL DEFAULT false;

ALTER TABLE parceiros_vendas
  ADD COLUMN IF NOT EXISTS bump_incluido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_liberado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acesso_liberado_em timestamptz;

DROP VIEW IF EXISTS parceiros_produtos_checkout;
CREATE VIEW parceiros_produtos_checkout AS
SELECT pp.id, pp.nome, pp.descricao, pp.preco, pp.parceiro_id, p.mp_public_key,
       pp.bump_ativo, pp.bump_nome, pp.bump_descricao, pp.bump_preco
FROM parceiros_produtos pp
JOIN parceiros p ON p.id = pp.parceiro_id
WHERE pp.status::text = 'ativo'::text;

GRANT SELECT ON parceiros_produtos_checkout TO anon, authenticated;
