-- Follow-up de cobranca: marca quando o usuario ja entrou em contato sobre
-- aquela parcela especifica. Fica no proprio pagamento (nao na tarefa do dia),
-- entao persiste mesmo quando o resumo de amanha for gerado de novo.
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS cobranca_contatado_em TIMESTAMP WITH TIME ZONE;

-- Payload estruturado (listas de inadimplentes/vencimentos/pagamentos) pra
-- renderizar interativo no painel do agente, alem do texto corrido.
ALTER TABLE equipe_11ds_tarefas ADD COLUMN IF NOT EXISTS dados JSONB;
