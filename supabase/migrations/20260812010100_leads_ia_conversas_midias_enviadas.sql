-- Rastreia quais mídias (tripé, ppc/certificado, vídeo de depoimento) já
-- foram mandadas nesta conversa, pra IA nunca repetir a mesma mídia 2x.
ALTER TABLE public.leads_ia_conversas
  ADD COLUMN IF NOT EXISTS midias_enviadas TEXT[] NOT NULL DEFAULT '{}';
