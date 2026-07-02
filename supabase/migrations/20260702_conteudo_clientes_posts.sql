-- Aba "Post": clientes atendidos pela 11 Digital Strategy e os posts diarios gerados
-- (imagem stopscroll + legenda) para aprovacao da equipe.

CREATE TABLE IF NOT EXISTS conteudo_clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(255) NOT NULL,
  nicho VARCHAR(255),
  publico_alvo TEXT,
  tom_de_voz TEXT,
  cor_primaria VARCHAR(7),
  cor_secundaria VARCHAR(7),
  logo_url TEXT,
  hashtags_fixas TEXT[] DEFAULT '{}',
  cta_padrao TEXT,
  temas_evitar TEXT[] DEFAULT '{}',
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conteudo_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES conteudo_clientes(id) ON DELETE CASCADE,
  data_post DATE NOT NULL DEFAULT CURRENT_DATE,
  tema VARCHAR(255),
  tema_fonte TEXT,
  legenda TEXT,
  imagem_feed_url TEXT,
  imagem_stories_url TEXT,
  status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'publicado', 'rejeitado')),
  aprovado_por UUID REFERENCES profiles(id),
  aprovado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conteudo_posts_cliente_id ON conteudo_posts(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conteudo_posts_data_post ON conteudo_posts(data_post);
CREATE INDEX IF NOT EXISTS idx_conteudo_posts_status ON conteudo_posts(status);

ALTER TABLE conteudo_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_posts ENABLE ROW LEVEL SECURITY;

-- Somente equipe autenticada (sem policy anon) — restricao a admin fica na camada de app,
-- igual a aba "Produtos" hoje.
CREATE POLICY "Authenticated users can view conteudo_clientes" ON conteudo_clientes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage conteudo_clientes" ON conteudo_clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view conteudo_posts" ON conteudo_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage conteudo_posts" ON conteudo_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reaproveita a funcao update_updated_at_column() criada em 20260106190000_create_operations_tables.sql
CREATE TRIGGER update_conteudo_clientes_updated_at BEFORE UPDATE ON conteudo_clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conteudo_posts_updated_at BEFORE UPDATE ON conteudo_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ATENCAO: crie o bucket 'conteudo-criativos' no Supabase Storage Dashboard
-- com "Public bucket" ativado (mesmo padrao usado em fotos-grupo/contratos).
