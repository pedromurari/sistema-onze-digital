-- Campos de identidade/estrategia de conteudo vindos da skill "conteudo-diario":
-- pilares fixos, estilo visual do headline, formula de headline opcional, e
-- arquetipos visuais preferidos/evitar (pra variar a composicao da imagem).
ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS pilares_conteudo TEXT[] DEFAULT '{}';
ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS estilo_visual VARCHAR(20) NOT NULL DEFAULT 'manchete' CHECK (estilo_visual IN ('manchete', 'editorial'));
ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS formula_headline TEXT;
ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS arquetipos_visuais_preferidos TEXT[] DEFAULT '{}';
ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS arquetipos_visuais_evitar TEXT[] DEFAULT '{}';

-- Rastreio de rotacao: qual pilar/arquetipo cada post usou, pra nao repetir a
-- mesma familia de assunto ou o mesmo arquetipo visual dias seguidos.
ALTER TABLE conteudo_posts ADD COLUMN IF NOT EXISTS pilar TEXT;
ALTER TABLE conteudo_posts ADD COLUMN IF NOT EXISTS arquetipo_visual TEXT;

-- Bucket publico para logo dos clientes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('conteudo-clientes-logos', 'conteudo-clientes-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload conteudo-clientes-logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'conteudo-clientes-logos');
CREATE POLICY "Authenticated users can view conteudo-clientes-logos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'conteudo-clientes-logos');
