-- Novo time/agente "Financeiro": identifica inadimplentes, vencimentos proximos
-- (7 dias e 1 dia antes) e pagamentos do dia para conferencia manual. Nao envia
-- nada sozinho — so lista, para o usuario mandar a mensagem/confirmar na mao.

-- Cada agente agora sabe qual edge function executa suas tarefas (generaliza o
-- que antes era hardcoded para 'equipe-11ds-executar').
ALTER TABLE equipe_11ds_agentes ADD COLUMN IF NOT EXISTS executor_function TEXT NOT NULL DEFAULT 'equipe-11ds-executar';

INSERT INTO equipe_11ds_times (nome, slug, emoji, ordem)
VALUES ('Financeiro', 'financeiro', '💰', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO equipe_11ds_agentes (time_id, nome, cargo, ordem, status, executor_function)
SELECT id, 'Ana', 'Financeiro', 0, 'livre', 'equipe-11ds-financeiro-executar'
FROM equipe_11ds_times WHERE slug = 'financeiro'
ON CONFLICT DO NOTHING;

-- Tarefa recorrente "de sistema": roda todo dia junto com o cron das 08h
-- (equipe-11ds-diario ja processa recorrentes de qualquer agente).
INSERT INTO equipe_11ds_recorrentes (agente_id, tipo, ordem_texto, ativo)
SELECT ag.id, 'avulso', 'Gerar o resumo financeiro diario: inadimplentes, vencimentos proximos (7 e 1 dia) e pagamentos de hoje para conferencia.', TRUE
FROM equipe_11ds_agentes ag
JOIN equipe_11ds_times t ON t.id = ag.time_id
WHERE t.slug = 'financeiro'
ON CONFLICT DO NOTHING;
