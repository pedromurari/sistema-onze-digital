-- kanban_colunas.tipo_regra e meta_leads são referenciados em todo o código
-- (useKanbanColunas.ts, ColunaSettingsModal, LancamentoKanban) desde a migration
-- 20260416_kanban_colunas_extend.sql, mas nunca chegaram a existir de fato na tabela
-- remota (drift entre migration file e banco) — descoberto ao tentar criar colunas
-- para o novo tipo 'leads_quadro', que falhava com PGRST204 "column not found".
-- Sem isso, criar/editar coluna em QUALQUER kanban (Lançamento/NPA/Aula Secreta/
-- Leads) já vinha falhando silenciosamente.
ALTER TABLE public.kanban_colunas
  ADD COLUMN IF NOT EXISTS meta_leads INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_regra TEXT DEFAULT 'normal';

NOTIFY pgrst, 'reload schema';
