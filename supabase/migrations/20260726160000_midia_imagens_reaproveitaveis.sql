-- Banco compartilhado de imagens fotograficas brutas (sem headline/logo
-- queimado) reaproveitaveis entre canais -- cada geracao de imagem por IA tem
-- custo real, entao uma imagem paga uma vez pode alimentar tanto um video do
-- Reels IDM (Modo A) quanto um post fotografico da Nina no futuro. So o lado
-- de escrita (Modo A gravando aqui) entra agora; a Nina passar a consumir daqui
-- fica pra depois, com cuidado, por ja estar em producao pra clientes reais.

CREATE TABLE IF NOT EXISTS public.midia_imagens_reaproveitaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.conteudo_clientes(id),
  image_url TEXT NOT NULL,
  image_prompt TEXT,
  arquetipo_visual TEXT,
  origem TEXT NOT NULL CHECK (origem IN ('video_reels', 'post_fotografico')),
  vezes_reaproveitado INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS midia_imagens_reaproveitaveis_cliente_idx
  ON public.midia_imagens_reaproveitaveis (cliente_id, vezes_reaproveitado, created_at);

ALTER TABLE public.midia_imagens_reaproveitaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view midia_imagens_reaproveitaveis" ON public.midia_imagens_reaproveitaveis;
CREATE POLICY "Authenticated users can view midia_imagens_reaproveitaveis"
  ON public.midia_imagens_reaproveitaveis FOR SELECT TO authenticated USING (true);
