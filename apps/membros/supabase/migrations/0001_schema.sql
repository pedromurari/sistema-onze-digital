-- ============================================================
-- IDM Tools — Schema Principal
-- ============================================================

-- profiles: extensão 1:1 de auth.users
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  role         TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- products: cursos, ebooks, bundles
CREATE TABLE public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  thumbnail_url TEXT,
  product_type  TEXT NOT NULL DEFAULT 'course' CHECK (product_type IN ('course', 'ebook', 'bundle')),
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- modules: módulos/capítulos dentro de um produto
CREATE TABLE public.modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- lessons: aulas individuais
CREATE TABLE public.lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id       UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  lesson_type     TEXT NOT NULL DEFAULT 'video' CHECK (lesson_type IN ('video', 'text', 'file')),
  video_url       TEXT,           -- URL do YouTube ou outro player
  video_duration  INTEGER,        -- duração em segundos
  content         TEXT,           -- markdown para aulas de texto
  file_url        TEXT,           -- PDF ou download
  is_free_preview BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- enrollments: relação aluno ↔ produto
CREATE TABLE public.enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,    -- NULL = acesso vitalício
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(user_id, product_id)
);

-- progress: conclusão por aula
CREATE TABLE public.progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, lesson_id)
);

-- Índices para padrões de consulta frequentes
CREATE INDEX idx_modules_product_id     ON public.modules(product_id);
CREATE INDEX idx_lessons_module_id      ON public.lessons(module_id);
CREATE INDEX idx_enrollments_user_id    ON public.enrollments(user_id);
CREATE INDEX idx_enrollments_product_id ON public.enrollments(product_id);
CREATE INDEX idx_progress_user_id       ON public.progress(user_id);
CREATE INDEX idx_progress_lesson_id     ON public.progress(lesson_id);

-- View: progresso percentual por aluno por produto
CREATE OR REPLACE VIEW public.course_progress AS
SELECT
  e.user_id,
  e.product_id,
  COUNT(l.id)                                              AS total_lessons,
  COUNT(p.id) FILTER (WHERE p.completed = TRUE)            AS completed_lessons,
  ROUND(
    COUNT(p.id) FILTER (WHERE p.completed = TRUE)::NUMERIC
    / NULLIF(COUNT(l.id), 0) * 100
  )                                                        AS percent_complete
FROM public.enrollments e
JOIN public.modules m  ON m.product_id = e.product_id
JOIN public.lessons l  ON l.module_id  = m.id
LEFT JOIN public.progress p ON p.lesson_id = l.id AND p.user_id = e.user_id
GROUP BY e.user_id, e.product_id;
