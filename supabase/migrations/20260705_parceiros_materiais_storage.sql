-- Bucket 'parceiros-materiais' (publico) + politicas de storage para o modulo Parceiros.
-- Upload feito pela equipe interna logada no CRM; leitura publica garantida pela flag
-- "public" do bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('parceiros-materiais', 'parceiros-materiais', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload parceiros-materiais" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'parceiros-materiais');
CREATE POLICY "Authenticated users can update parceiros-materiais" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'parceiros-materiais') WITH CHECK (bucket_id = 'parceiros-materiais');
CREATE POLICY "Authenticated users can view parceiros-materiais" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'parceiros-materiais');
