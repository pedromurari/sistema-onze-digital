-- Assets de mídia que o SDR de IA (leads-ia-responder) manda automaticamente
-- durante a conversa: tripé psicanalítico, PPC aprovado, certificado exemplo,
-- vídeo de depoimento de aluna. Bucket público (mesmo padrão de idm-reels) --
-- a Evolution API precisa buscar a URL sem autenticação pra enviar como mídia.
INSERT INTO storage.buckets (id, name, public) VALUES ('leads-ia-midia', 'leads-ia-midia', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload leads-ia-midia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'leads-ia-midia');
CREATE POLICY "Public can view leads-ia-midia" ON storage.objects FOR SELECT USING (bucket_id = 'leads-ia-midia');
-- Os 4 arquivos (tripe-psicanalitico.jpg, ppc-aprovado.jpg,
-- certificado-exemplo.jpg, depoimento-aluna.mp4) foram enviados uma única vez
-- via upload manual logo após esta migration -- não fazem parte dela.
