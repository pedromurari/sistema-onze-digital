-- Tabela de responsaveis (donos) das turmas
CREATE TABLE IF NOT EXISTS responsaveis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE responsaveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "responsaveis_all_authenticated" ON responsaveis
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Adiciona coluna responsavel_id na tabela turmas
ALTER TABLE turmas ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_turmas_responsavel_id ON turmas(responsavel_id);
