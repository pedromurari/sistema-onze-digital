-- ============================================================
-- IDM Tools — Row Level Security
-- ============================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress    ENABLE ROW LEVEL SECURITY;

-- Função helper: verifica se o usuário atual é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()
$$;

-- Função helper: verifica se o usuário está matriculado em um produto
CREATE OR REPLACE FUNCTION public.is_enrolled(p_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE user_id    = auth.uid()
      AND product_id = p_product_id
      AND is_active  = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
  )
$$;

-- ---- profiles ----
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL USING (public.is_admin());

-- ---- products ----
CREATE POLICY "products_select_published"
  ON public.products FOR SELECT
  USING (is_published = TRUE OR public.is_admin());
CREATE POLICY "products_admin_write"
  ON public.products FOR ALL USING (public.is_admin());

-- ---- modules ----
CREATE POLICY "modules_select_enrolled"
  ON public.modules FOR SELECT
  USING (public.is_admin() OR public.is_enrolled(product_id));
CREATE POLICY "modules_admin_write"
  ON public.modules FOR ALL USING (public.is_admin());

-- ---- lessons ----
CREATE POLICY "lessons_select"
  ON public.lessons FOR SELECT
  USING (
    public.is_admin()
    OR is_free_preview = TRUE
    OR public.is_enrolled(
      (SELECT product_id FROM public.modules WHERE id = module_id)
    )
  );
CREATE POLICY "lessons_admin_write"
  ON public.lessons FOR ALL USING (public.is_admin());

-- ---- enrollments ----
CREATE POLICY "enrollments_select_own"
  ON public.enrollments FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "enrollments_admin_all"
  ON public.enrollments FOR ALL USING (public.is_admin());

-- ---- progress ----
CREATE POLICY "progress_select_own"
  ON public.progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "progress_insert_own"
  ON public.progress FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "progress_update_own"
  ON public.progress FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "progress_admin_all"
  ON public.progress FOR ALL USING (public.is_admin());
