-- Criar tabela de turmas financeiras
CREATE TABLE IF NOT EXISTS financial_turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  valor_padrao NUMERIC(10, 2) DEFAULT 0,
  ativa BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de alunos financeiros
CREATE TABLE IF NOT EXISTS financial_alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID REFERENCES financial_turmas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  dia_vencimento INTEGER NOT NULL DEFAULT 10, -- 10 ou 20
  valor_mensalidade NUMERIC(10, 2) NOT NULL,
  status_mes TEXT DEFAULT 'pendente', -- 'pago' ou 'pendente'
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de histórico de pagamentos
CREATE TABLE IF NOT EXISTS financial_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID REFERENCES financial_alunos(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL, -- formato: 'YYYY-MM'
  valor_pago NUMERIC(10, 2) NOT NULL,
  data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metodo_pagamento TEXT, -- 'pix', 'boleto', 'cartao', 'transferencia'
  comprovante_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes para performance
CREATE INDEX idx_financial_alunos_turma_id ON financial_alunos(turma_id);
CREATE INDEX idx_financial_alunos_dia_vencimento ON financial_alunos(dia_vencimento);
CREATE INDEX idx_financial_pagamentos_aluno_id ON financial_pagamentos(aluno_id);
CREATE INDEX idx_financial_pagamentos_mes_referencia ON financial_pagamentos(mes_referencia);

-- Habilitar RLS (Row Level Security)
ALTER TABLE financial_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_pagamentos ENABLE ROW LEVEL SECURITY;

-- Policies para admin
CREATE POLICY "Admin can manage turmas" ON financial_turmas
  FOR ALL USING (auth.jwt() ->> 'tipo' = 'admin');

CREATE POLICY "Admin can manage alunos" ON financial_alunos
  FOR ALL USING (auth.jwt() ->> 'tipo' = 'admin');

CREATE POLICY "Admin can manage pagamentos" ON financial_pagamentos
  FOR ALL USING (auth.jwt() ->> 'tipo' = 'admin');

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE financial_turmas;
ALTER PUBLICATION supabase_realtime ADD TABLE financial_alunos;
ALTER PUBLICATION supabase_realtime ADD TABLE financial_pagamentos;
