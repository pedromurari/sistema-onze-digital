-- ============================================================
-- lesson_materiais — PDFs extras anexados a uma aula (além do
-- file_url único já existente pra aulas 100% em PDF). Uma aula em
-- vídeo pode ter N materiais de apoio em PDF juntos, não só 1.
-- ============================================================

CREATE TABLE public.lesson_materiais (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  titulo     TEXT,
  url        TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lesson_materiais_lesson_id_idx ON public.lesson_materiais(lesson_id);

ALTER TABLE public.lesson_materiais ENABLE ROW LEVEL SECURITY;

-- Mesma visibilidade da aula dona do material: admin vê tudo,
-- aluno vê se a aula é free preview ou se está matriculado no produto.
CREATE POLICY "lesson_materiais_select"
  ON public.lesson_materiais FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_id
        AND (
          l.is_free_preview = TRUE
          OR public.is_enrolled((SELECT product_id FROM public.modules WHERE id = l.module_id))
        )
    )
  );

CREATE POLICY "lesson_materiais_admin_write"
  ON public.lesson_materiais FOR ALL USING (public.is_admin());
