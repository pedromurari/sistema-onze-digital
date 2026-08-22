-- Novo time "Operações" e nova colaboradora "Bia" (Comunicação & Disparos).
-- Ela le os logs de disparo ja existentes (boas_vindas_logs, funnel_messages,
-- disparo_leads/disparo_campanhas, grupo_add_jobs) e devolve, em numeros
-- deterministicos, onde estao os gargalos do funil de comunicacao.
-- Time separado (nao entra no Financeiro) porque a ideia e' virar a casa de
-- futuros colaboradores de dados/operacoes, nao so disparo.

INSERT INTO equipe_11ds_times (nome, slug, emoji, ordem)
SELECT 'Operações', 'operacoes', '📡', 2
WHERE NOT EXISTS (SELECT 1 FROM equipe_11ds_times WHERE slug = 'operacoes');

INSERT INTO equipe_11ds_agentes (time_id, nome, cargo, slug, ordem, status, executor_function)
SELECT (SELECT id FROM equipe_11ds_times WHERE slug = 'operacoes'), 'Bia', 'Comunicação & Disparos', 'bia-comunicacao', 0, 'livre', 'equipe-11ds-comunicacao-executar'
WHERE NOT EXISTS (SELECT 1 FROM equipe_11ds_agentes WHERE slug = 'bia-comunicacao');

-- Relatorio diario automatico (resumo de ontem) -- reaproveita o mecanismo de
-- recorrentes que o equipe-11ds-diario ja processa, sem precisar de codigo
-- novo na rotina diaria.
INSERT INTO equipe_11ds_recorrentes (agente_id, tipo, cliente_id, ordem_texto, ativo)
SELECT (SELECT id FROM equipe_11ds_agentes WHERE slug = 'bia-comunicacao'), 'avulso', NULL,
  'Gere o relatório de disparos de ontem: boas-vindas (e-mail e WhatsApp), mensagens de funil/grupo, disparos em massa e adição a grupos.', true
WHERE NOT EXISTS (
  SELECT 1 FROM equipe_11ds_recorrentes
  WHERE agente_id = (SELECT id FROM equipe_11ds_agentes WHERE slug = 'bia-comunicacao')
);
