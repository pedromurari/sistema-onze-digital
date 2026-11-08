-- ============================================================
-- IDM Tools — Storage Buckets
-- ============================================================

-- avatars: público (leitura), escrita apenas do próprio usuário
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- course-thumbnails: público (leitura), escrita apenas admin
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-thumbnails', 'course-thumbnails', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "thumbnails_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-thumbnails');

CREATE POLICY "thumbnails_admin_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'course-thumbnails' AND public.is_admin());

CREATE POLICY "thumbnails_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'course-thumbnails' AND public.is_admin());

CREATE POLICY "thumbnails_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'course-thumbnails' AND public.is_admin());

-- course-materials: privado, somente admin faz upload; alunos acessam via URL assinada (server-side)
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "materials_admin_all"
  ON storage.objects FOR ALL
  USING (bucket_id = 'course-materials' AND public.is_admin());
