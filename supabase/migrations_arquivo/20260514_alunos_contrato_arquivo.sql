-- Armazena o arquivo do contrato assinado (via Supabase Storage)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS contrato_arquivo_url  TEXT,
  ADD COLUMN IF NOT EXISTS contrato_arquivo_nome TEXT;

-- ATENÇÃO: crie o bucket 'contratos' no Supabase Storage Dashboard
-- com acesso público ou configure as políticas de acordo com sua necessidade.
-- Política sugerida (bucket público):
--   Storage > Buckets > contratos > Public bucket: ativado
-- Ou (bucket privado com RLS):
--   CREATE POLICY "contratos_authenticated" ON storage.objects
--     FOR ALL TO authenticated
--     USING (bucket_id = 'contratos')
--     WITH CHECK (bucket_id = 'contratos');
