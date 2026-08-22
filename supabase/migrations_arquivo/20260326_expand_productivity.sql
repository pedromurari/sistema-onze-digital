-- Expandir tasks com novos campos
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS co_responsaveis UUID[] DEFAULT '{}'::uuid[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'em_andamento', 'revisao', 'concluido'));

-- Tabela para comentários
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para histórico de alterações
CREATE TABLE IF NOT EXISTS task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_anterior JSONB,
  valor_novo JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para nós do mapa mental
CREATE TABLE IF NOT EXISTS mind_map_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('empresa', 'funil', 'etapa_funil', 'canal', 'metrica', 'observacao')),
  titulo TEXT NOT NULL,
  x FLOAT DEFAULT 0,
  y FLOAT DEFAULT 0,
  largura FLOAT DEFAULT 150,
  altura FLOAT DEFAULT 80,
  cor TEXT DEFAULT '#000000',
  icone TEXT,
  dados JSONB DEFAULT '{}'::jsonb,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para conexões entre nós
CREATE TABLE IF NOT EXISTS mind_map_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  no_origem_id UUID NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  no_destino_id UUID NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  tipo_linha TEXT DEFAULT 'reta' CHECK (tipo_linha IN ('reta', 'tracejada')),
  label TEXT,
  cor TEXT DEFAULT '#999999',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_usuario ON mind_map_nodes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_connections_usuario ON mind_map_connections(usuario_id);

-- RLS Policies
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_map_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mind_map_connections ENABLE ROW LEVEL SECURITY;

-- task_comments policies
CREATE POLICY "Users can view task comments" ON task_comments FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert task comments" ON task_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- task_history policies
CREATE POLICY "Users can view task history" ON task_history FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert task history" ON task_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- mind_map_nodes policies
CREATE POLICY "Users can view own mind maps" ON mind_map_nodes FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can create mind maps" ON mind_map_nodes FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update own mind maps" ON mind_map_nodes FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own mind maps" ON mind_map_nodes FOR DELETE USING (auth.uid() = usuario_id);

-- mind_map_connections policies
CREATE POLICY "Users can view own connections" ON mind_map_connections FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users can create connections" ON mind_map_connections FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users can update own connections" ON mind_map_connections FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users can delete own connections" ON mind_map_connections FOR DELETE USING (auth.uid() = usuario_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE task_history;
ALTER PUBLICATION supabase_realtime ADD TABLE mind_map_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE mind_map_connections;
