-- Rodízio de instâncias Evolution por campanha de disparo
ALTER TABLE public.disparo_campanhas
  ADD COLUMN IF NOT EXISTS evolution_config_ids TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: campanhas existentes mantêm a instância única que já usavam
UPDATE public.disparo_campanhas
SET evolution_config_ids = ARRAY[evolution_config_id]
WHERE evolution_config_ids = '{}' AND evolution_config_id IS NOT NULL;

-- Registra qual instância efetivamente enviou cada mensagem (auditoria de bans/erros por número)
ALTER TABLE public.disparo_leads
  ADD COLUMN IF NOT EXISTS instance_id TEXT;
