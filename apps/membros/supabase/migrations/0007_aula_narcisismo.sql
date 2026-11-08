-- ============================================================
-- IDM Tools — Aula "Narcisismo na Ótica da Psicanálise"
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aula_quiz_respostas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aula_slug    TEXT        NOT NULL DEFAULT 'narcisismo-psicanalise',
  respostas    JSONB       NOT NULL,
  acertos      INT         NOT NULL,
  total        INT         NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, aula_slug)
);

CREATE INDEX IF NOT EXISTS idx_aula_quiz_user ON public.aula_quiz_respostas(user_id);

ALTER TABLE public.aula_quiz_respostas ENABLE ROW LEVEL SECURITY;

-- Cada aluno só vê e grava a própria resposta
CREATE POLICY "aula_quiz_select_own"
  ON public.aula_quiz_respostas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "aula_quiz_insert_own"
  ON public.aula_quiz_respostas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "aula_quiz_update_own"
  ON public.aula_quiz_respostas FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin enxerga tudo (painel)
CREATE POLICY "aula_quiz_select_admin"
  ON public.aula_quiz_respostas FOR SELECT
  USING (public.is_admin());
