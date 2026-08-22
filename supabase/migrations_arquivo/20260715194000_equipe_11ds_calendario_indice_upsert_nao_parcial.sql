-- O indice unico parcial (WHERE cliente_id IS NOT NULL) nao satisfaz a inferencia
-- de ON CONFLICT (cliente_id, data_publicacao) do Postgres/PostgREST -- toda
-- chamada de upsert (equipe-11ds-executar e equipe-11ds-calendario-executar)
-- estava falhando silenciosamente com "no unique or exclusion constraint
-- matching the ON CONFLICT specification". Troca pra indice unico nao-parcial:
-- linhas com cliente_id NULL (calendario manual antigo) continuam coexistindo
-- normalmente, porque NULL nunca conflita com NULL em indice unico do Postgres.

DROP INDEX IF EXISTS conteudo_calendario_cliente_data_key;
CREATE UNIQUE INDEX conteudo_calendario_cliente_data_key ON conteudo_calendario (cliente_id, data_publicacao);
