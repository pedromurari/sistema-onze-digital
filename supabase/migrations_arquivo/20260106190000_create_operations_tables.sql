-- Create operations tables migration
-- Tabelas para o novo sistema de Operações

-- Tabela para tarefas_etapas (etapas de tarefas sequenciais)
CREATE TABLE IF NOT EXISTS tarefas_etapas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  responsavel UUID NOT NULL REFERENCES users(id),
  prazo TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido')),
  desbloqueada BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para tarefas_checklists (checklists das tarefas)
CREATE TABLE IF NOT EXISTS tarefas_checklists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  texto VARCHAR(500) NOT NULL,
  concluido BOOLEAN DEFAULT FALSE,
  ordem INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para tarefas_comentarios (comentários das tarefas)
CREATE TABLE IF NOT EXISTS tarefas_comentarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES users(id),
  texto TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para eventos_calendario (eventos do calendário geral)
CREATE TABLE IF NOT EXISTS eventos_calendario (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE,
  cor VARCHAR(7) DEFAULT '#3b82f6',
  tipo VARCHAR(20) DEFAULT 'avulso',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para conteudo_calendario (calendário de conteúdo)
CREATE TABLE IF NOT EXISTS conteudo_calendario (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  plataforma VARCHAR(20) NOT NULL CHECK (plataforma IN ('instagram', 'youtube', 'tiktok', 'linkedin')),
  formato VARCHAR(20) NOT NULL CHECK (formato IN ('reels', 'feed', 'stories', 'carrossel', 'video', 'short')),
  responsavel UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'ideia' CHECK (status IN ('ideia', 'roteiro', 'gravando', 'editando', 'agendado', 'publicado')),
  data_publicacao TIMESTAMP WITH TIME ZONE NOT NULL,
  legenda TEXT,
  link VARCHAR(500),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tarefas_etapas_tarefa_id ON tarefas_etapas(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_etapas_ordem ON tarefas_etapas(tarefa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_tarefas_checklists_tarefa_id ON tarefas_checklists(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_comentarios_tarefa_id ON tarefas_comentarios(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_eventos_calendario_data_inicio ON eventos_calendario(data_inicio);
CREATE INDEX IF NOT EXISTS idx_eventos_calendario_created_by ON eventos_calendario(created_by);
CREATE INDEX IF NOT EXISTS idx_conteudo_calendario_data_publicacao ON conteudo_calendario(data_publicacao);
CREATE INDEX IF NOT EXISTS idx_conteudo_calendario_responsavel ON conteudo_calendario(responsavel);
CREATE INDEX IF NOT EXISTS idx_conteudo_calendario_plataforma ON conteudo_calendario(plataforma);

-- Políticas RLS (Row Level Security)
ALTER TABLE tarefas_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_calendario ENABLE ROW LEVEL SECURITY;

-- Políticas para tarefas_etapas
CREATE POLICY "Users can view tarefas_etapas for their tasks" ON tarefas_etapas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_etapas.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Users can insert tarefas_etapas for their tasks" ON tarefas_etapas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_etapas.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Users can update tarefas_etapas for their tasks" ON tarefas_etapas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_etapas.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

-- Políticas para tarefas_checklists
CREATE POLICY "Users can view tarefas_checklists for their tasks" ON tarefas_checklists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_checklists.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Users can insert tarefas_checklists for their tasks" ON tarefas_checklists
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_checklists.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Users can update tarefas_checklists for their tasks" ON tarefas_checklists
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_checklists.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

-- Políticas para tarefas_comentarios
CREATE POLICY "Users can view tarefas_comentarios for their tasks" ON tarefas_comentarios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_comentarios.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Users can insert tarefas_comentarios for their tasks" ON tarefas_comentarios
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tarefas
      WHERE tarefas.id = tarefas_comentarios.tarefa_id
      AND (tarefas.created_by = auth.uid() OR tarefas.responsaveis @> ARRAY[auth.uid()])
    )
  );

-- Políticas para eventos_calendario
CREATE POLICY "Users can view all eventos_calendario" ON eventos_calendario FOR SELECT USING (true);
CREATE POLICY "Users can insert their own eventos_calendario" ON eventos_calendario FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own eventos_calendario" ON eventos_calendario FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their own eventos_calendario" ON eventos_calendario FOR DELETE USING (auth.uid() = created_by);

-- Políticas para conteudo_calendario
CREATE POLICY "Users can view all conteudo_calendario" ON conteudo_calendario FOR SELECT USING (true);
CREATE POLICY "Users can insert conteudo_calendario" ON conteudo_calendario FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update conteudo_calendario they are responsible for" ON conteudo_calendario FOR UPDATE USING (auth.uid() = responsavel);
CREATE POLICY "Users can delete conteudo_calendario they are responsible for" ON conteudo_calendario FOR DELETE USING (auth.uid() = responsavel);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_tarefas_etapas_updated_at BEFORE UPDATE ON tarefas_etapas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tarefas_checklists_updated_at BEFORE UPDATE ON tarefas_checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_eventos_calendario_updated_at BEFORE UPDATE ON eventos_calendario FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conteudo_calendario_updated_at BEFORE UPDATE ON conteudo_calendario FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();