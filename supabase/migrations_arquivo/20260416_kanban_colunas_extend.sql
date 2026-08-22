-- Extend kanban_colunas to support NPA and Aula Secreta, plus column rules
ALTER TABLE public.kanban_colunas
  ALTER COLUMN lancamento_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS npa_evento_id uuid REFERENCES public.npa_eventos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS aula_secreta_id uuid REFERENCES public.aula_secreta_eventos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fase_key text,
  ADD COLUMN IF NOT EXISTS cor text,
  ADD COLUMN IF NOT EXISTS meta_leads integer,
  ADD COLUMN IF NOT EXISTS tipo_regra text DEFAULT 'normal';

-- Default columns for existing NPA events
INSERT INTO public.kanban_colunas (npa_evento_id, nome, fase_key, ordem)
SELECT e.id, col.nome, col.fase_key, col.ordem
FROM public.npa_eventos e
CROSS JOIN (VALUES
  ('Novo',          'novo',          0),
  ('Ingresso Pago', 'ingresso_pago', 1),
  ('No Grupo',      'no_grupo',      2),
  ('Confirmado',    'confirmado',    3),
  ('Evento',        'evento',        4),
  ('Closer',        'closer',        5),
  ('Follow Up 01',  'follow_up_01',  6),
  ('Follow Up 02',  'follow_up_02',  7),
  ('Follow Up 03',  'follow_up_03',  8),
  ('Matrícula',     'matricula',     9)
) AS col(nome, fase_key, ordem)
ON CONFLICT DO NOTHING;

-- Default columns for existing Aula Secreta events
INSERT INTO public.kanban_colunas (aula_secreta_id, nome, fase_key, ordem)
SELECT e.id, col.nome, col.fase_key, col.ordem
FROM public.aula_secreta_eventos e
CROSS JOIN (VALUES
  ('Convite',   'convite',   0),
  ('No Grupo',  'no_grupo',  1),
  ('Matrícula', 'matricula', 2)
) AS col(nome, fase_key, ordem)
ON CONFLICT DO NOTHING;

-- RLS already enabled on kanban_colunas
