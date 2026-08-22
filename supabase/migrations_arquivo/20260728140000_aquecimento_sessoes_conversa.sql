-- Aquecimento: passa de "1 mensagem isolada" pra "sessão de conversa" (rajada
-- de várias mensagens em sequência, com intervalo humano entre elas) --
-- rampa agora conta sessões/dia, não mensagens/dia soltas.

ALTER TABLE public.aquecimento_jobs ADD COLUMN IF NOT EXISTS sessao_id uuid;
CREATE INDEX IF NOT EXISTS idx_aquecimento_jobs_sessao ON public.aquecimento_jobs (sessao_id) WHERE sessao_id IS NOT NULL;

ALTER TABLE public.aquecimento_config
  ADD COLUMN IF NOT EXISTS msgs_por_sessao_min INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS msgs_por_sessao_max INTEGER NOT NULL DEFAULT 8;

-- delay_min_s/delay_max_s passam a significar "intervalo entre mensagens de
-- uma mesma conversa" (antes era só o delay entre envios no mesmo tick do
-- worker) -- valores antigos (5-15s) eram bons pra isso mas rápidos demais
-- pra simular alguém digitando/lendo.
UPDATE public.aquecimento_config
SET
  delay_min_s = 20,
  delay_max_s = 90,
  rampa = '[
    {"dia_inicio":1,"dia_fim":3,"min":2,"max":3},
    {"dia_inicio":4,"dia_fim":7,"min":3,"max":5},
    {"dia_inicio":8,"dia_fim":14,"min":5,"max":8},
    {"dia_inicio":15,"dia_fim":21,"min":8,"max":12},
    {"dia_inicio":22,"dia_fim":null,"min":12,"max":18}
  ]'::jsonb
WHERE id = 'default';
