-- ============================================================
-- IDM Tools — Schema de Comércio (Motor de Vendas)
-- ============================================================

-- 1. Estender tabela products com campos de venda
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS original_price     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS currency           TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS checkout_url       TEXT,
  ADD COLUMN IF NOT EXISTS payment_type       TEXT NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS cta_label          TEXT,
  ADD COLUMN IF NOT EXISTS short_description  TEXT,
  ADD COLUMN IF NOT EXISTS highlights         TEXT[],
  ADD COLUMN IF NOT EXISTS badge_label        TEXT,
  ADD COLUMN IF NOT EXISTS is_featured        BOOLEAN NOT NULL DEFAULT FALSE;

-- Ampliar product_type para incluir mentoria e evento
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('course', 'ebook', 'bundle', 'mentorship', 'event'));

-- Constraint de payment_type
ALTER TABLE public.products
  ADD CONSTRAINT products_payment_type_check
  CHECK (payment_type IN ('one_time', 'subscription', 'free'));

-- 2. Tabela de depoimentos
CREATE TABLE IF NOT EXISTS public.testimonials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
  author_name  TEXT NOT NULL,
  author_role  TEXT,
  avatar_url   TEXT,
  content      TEXT NOT NULL,
  rating       INT CHECK (rating BETWEEN 1 AND 5),
  is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_product_id  ON public.testimonials(product_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_is_featured ON public.testimonials(is_featured);

-- 3. Tabela de pagamentos (Mercado Pago)
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  amount            DECIMAL(10,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'BRL',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id       ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_product_id    ON public.payments(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_mp_payment_id ON public.payments(mp_payment_id);

-- Trigger para updated_at em payments
CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_payments_updated_at();

-- 4. Tabela de conquistas (gamificação)
CREATE TABLE IF NOT EXISTS public.achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  xp_reward   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);

-- Seed: conquistas padrão
INSERT INTO public.achievements (slug, title, description, icon, xp_reward) VALUES
  ('first_lesson',     'Primeiro Passo',       'Completou sua primeira aula',          'Play',          10),
  ('course_complete',  'Curso Concluído',       'Finalizou um curso completo',          'Trophy',       100),
  ('certificate',      'Certificado Emitido',   'Resgatou um certificado',              'Award',         50),
  ('three_lessons',    'Em Ritmo',              'Completou 3 aulas seguidas',           'Flame',         25),
  ('first_purchase',   'Investidor do Futuro',  'Realizou sua primeira compra',         'ShoppingBag',   30)
ON CONFLICT (slug) DO NOTHING;

-- 5. RLS para novas tabelas

-- testimonials: leitura pública, escrita apenas admin
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "testimonials_select_all"
  ON public.testimonials FOR SELECT USING (TRUE);

CREATE POLICY "testimonials_insert_admin"
  ON public.testimonials FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "testimonials_update_admin"
  ON public.testimonials FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "testimonials_delete_admin"
  ON public.testimonials FOR DELETE
  USING (public.is_admin());

-- payments: usuário vê os próprios, admin vê todos
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "payments_insert_own"
  ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "payments_update_service"
  ON public.payments FOR UPDATE
  USING (public.is_admin());

-- achievements: leitura pública
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_select_all" ON public.achievements FOR SELECT USING (TRUE);

-- user_achievements: usuário vê as próprias
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements_select_own"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_achievements_insert_own"
  ON public.user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);
