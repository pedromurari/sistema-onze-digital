-- 'boas_vindas' foi adicionado como task válida no frontend (EvolutionTaskPanel) mas a
-- constraint do banco ainda só aceitava 'cobranca' | 'funil' | 'disparo' -- salvar a
-- instância da fila de boas-vindas quebrava com "violates check constraint
-- evolution_task_config_task_check".
ALTER TABLE public.evolution_task_config DROP CONSTRAINT evolution_task_config_task_check;
ALTER TABLE public.evolution_task_config
  ADD CONSTRAINT evolution_task_config_task_check
  CHECK (task = ANY (ARRAY['cobranca'::text, 'funil'::text, 'disparo'::text, 'boas_vindas'::text]));
