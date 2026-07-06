-- Programa de Parceiros IDM: parceiros (criadores convidados), produtos de parceria
-- (com aprovacao da diretoria antes de ganhar o Selo IDM) e cupons de afiliado
-- em rede cruzada (uma parceira pode ser afiliada do produto de outra).
-- Cadastro e todo manual, feito pela equipe interna dentro do CRM -- sem formulario
-- publico e sem acesso da parceira ao sistema.

CREATE TABLE IF NOT EXISTS parceiros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20),
  email VARCHAR(255),
  status_contrato VARCHAR(20) DEFAULT 'pendente' CHECK (status_contrato IN ('pendente', 'assinado')),
  pix_chave TEXT,
  observacoes TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parceiros_produtos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parceiro_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  preco NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'aprovado', 'ativo', 'pausado', 'reprovado')),
  comissao_idm_pct NUMERIC(5,2),
  comissao_parceiro_pct NUMERIC(5,2),
  comissao_afiliado_padrao_pct NUMERIC(5,2),
  material_url TEXT,
  aprovado_por UUID REFERENCES profiles(id),
  aprovado_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cupons de afiliado: qualquer parceiro pode ser afiliado do produto de outro (rede cruzada).
CREATE TABLE IF NOT EXISTS parceiros_cupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_id UUID NOT NULL REFERENCES parceiros_produtos(id) ON DELETE CASCADE,
  parceiro_afiliado_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  comissao_pct NUMERIC(5,2),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parceiros_produtos_parceiro_id ON parceiros_produtos(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_produtos_status ON parceiros_produtos(status);
CREATE INDEX IF NOT EXISTS idx_parceiros_cupons_produto_id ON parceiros_cupons(produto_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_cupons_afiliado_id ON parceiros_cupons(parceiro_afiliado_id);

ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros_cupons ENABLE ROW LEVEL SECURITY;

-- Somente equipe autenticada (sem policy anon) -- mesmo padrao de conteudo_clientes/conteudo_posts.
CREATE POLICY "Authenticated users can view parceiros" ON parceiros
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage parceiros" ON parceiros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view parceiros_produtos" ON parceiros_produtos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage parceiros_produtos" ON parceiros_produtos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view parceiros_cupons" ON parceiros_cupons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage parceiros_cupons" ON parceiros_cupons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_parceiros_updated_at BEFORE UPDATE ON parceiros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parceiros_produtos_updated_at BEFORE UPDATE ON parceiros_produtos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Primeiras parceiras pre-cadastradas do programa.
INSERT INTO parceiros (nome) VALUES
  ('Jocimara Anjos'),
  ('Amanda Calux'),
  ('Renata Weigert'),
  ('Rodrygo Murari (Fundador do IDM)')
ON CONFLICT DO NOTHING;

-- ATENCAO: crie o bucket 'parceiros-materiais' no Supabase Storage Dashboard
-- com "Public bucket" ativado (mesmo padrao usado em fotos-grupo/contratos).
