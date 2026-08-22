INSERT INTO storage.buckets (id, name, public) VALUES ('idm-reels', 'idm-reels', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload idm-reels" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'idm-reels');
CREATE POLICY "Authenticated users can view idm-reels" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'idm-reels');
