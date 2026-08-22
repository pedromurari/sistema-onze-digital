-- Nome da parceira e do produto salvos direto no link, em vez de depender de
-- join com parceiros/parceiros_produtos -- essas tabelas nao tem policy anon,
-- entao a pagina publica /ir/:slug (visitante anonimo) nao conseguia ler o
-- nome pra montar o UTM (utm_source/utm_campaign) do redirect.

ALTER TABLE parceiros_links
  ADD COLUMN IF NOT EXISTS parceira_nome text,
  ADD COLUMN IF NOT EXISTS produto_nome text;

UPDATE parceiros_links l
SET parceira_nome = p.nome
FROM parceiros p
WHERE l.parceiro_id = p.id AND l.parceira_nome IS NULL;

UPDATE parceiros_links l
SET produto_nome = pp.nome
FROM parceiros_produtos pp
WHERE l.produto_id = pp.id AND l.produto_nome IS NULL;
