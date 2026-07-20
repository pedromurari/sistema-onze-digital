-- Rastreamento de cliques por link proprio (pra medir trafego de cada parceira,
-- ja que checkouts hospedados fora do nosso (ex: SyncPay) nao repassam UTM/dados
-- de formulario) + colunas pra correlacionar vendas vindas do checkout hospedado
-- da SyncPay (produtos criados direto no dashboard da Sync, fora da nossa API).

ALTER TABLE parceiros_produtos
  ADD COLUMN IF NOT EXISTS syncpay_product_token text,
  ADD COLUMN IF NOT EXISTS syncpay_checkout_url text;

ALTER TABLE parceiros_vendas
  ADD COLUMN IF NOT EXISTS syncpay_transaction_id text,
  ADD COLUMN IF NOT EXISTS origem varchar(20) NOT NULL DEFAULT 'checkout_idm' CHECK (origem IN ('checkout_idm', 'syncpay')),
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_parceiros_vendas_syncpay_tx
  ON parceiros_vendas(syncpay_transaction_id) WHERE syncpay_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS parceiros_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parceiro_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES parceiros_produtos(id) ON DELETE SET NULL,
  slug VARCHAR(80) UNIQUE NOT NULL,
  titulo VARCHAR(255),
  destino_url TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parceiros_cliques (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES parceiros_links(id) ON DELETE CASCADE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parceiros_links_parceiro ON parceiros_links(parceiro_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_cliques_link ON parceiros_cliques(link_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_cliques_created ON parceiros_cliques(created_at);

ALTER TABLE parceiros_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros_cliques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view parceiros_links" ON parceiros_links
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage parceiros_links" ON parceiros_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anon can resolve active links" ON parceiros_links
  FOR SELECT TO anon USING (ativo = true);

CREATE POLICY "Authenticated users can view parceiros_cliques" ON parceiros_cliques
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can log clicks" ON parceiros_cliques
  FOR INSERT TO anon WITH CHECK (true);

CREATE TRIGGER update_parceiros_links_updated_at BEFORE UPDATE ON parceiros_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
