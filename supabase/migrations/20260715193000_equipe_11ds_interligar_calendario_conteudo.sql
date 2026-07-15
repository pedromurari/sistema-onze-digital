-- Pivot: em vez de uma tabela paralela pra Equipe 11DS, interliga com o
-- calendario de conteudo que ja existe no sistema (Operacoes > Calendario de
-- Conteudo, tabela conteudo_calendario, ate agora so alimentada manualmente).
-- Remove a tabela redundante criada por engano antes dessa constatacao.

DROP TABLE IF EXISTS equipe_11ds_calendario_conteudo;

ALTER TABLE conteudo_calendario ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES conteudo_clientes(id);

CREATE UNIQUE INDEX IF NOT EXISTS conteudo_calendario_cliente_data_key ON conteudo_calendario (cliente_id, data_publicacao) WHERE cliente_id IS NOT NULL;
