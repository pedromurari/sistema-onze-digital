-- Conversa acionável da Equipe 11DS. O frontend só lê o histórico; a Edge
-- Function autenticada cria mensagens e propostas, e só executa após confirmação.

CREATE TABLE IF NOT EXISTS equipe_11ds_chat_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id) ON DELETE CASCADE,
  solicitante_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('executar_tarefa', 'gerar_proximo_post', 'gerar_calendario')),
  estado TEXT NOT NULL DEFAULT 'proposta' CHECK (estado IN ('proposta', 'confirmada', 'cancelada', 'concluida', 'erro')),
  resumo TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB,
  erro_mensagem TEXT,
  confirmado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipe_11ds_chat_acoes_usuario_agente_idx
  ON equipe_11ds_chat_acoes (solicitante_id, agente_id, created_at DESC);

CREATE TABLE IF NOT EXISTS equipe_11ds_chat_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id) ON DELETE CASCADE,
  solicitante_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  papel TEXT NOT NULL CHECK (papel IN ('usuario', 'agente', 'sistema')),
  conteudo TEXT NOT NULL,
  acao_id UUID REFERENCES equipe_11ds_chat_acoes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipe_11ds_chat_mensagens_usuario_agente_idx
  ON equipe_11ds_chat_mensagens (solicitante_id, agente_id, created_at DESC);

ALTER TABLE equipe_11ds_chat_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_chat_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their agent chat actions" ON equipe_11ds_chat_acoes;
CREATE POLICY "Users can view their agent chat actions"
  ON equipe_11ds_chat_acoes FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their agent chat messages" ON equipe_11ds_chat_mensagens;
CREATE POLICY "Users can view their agent chat messages"
  ON equipe_11ds_chat_mensagens FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid());

-- Escritas acontecem apenas pela service role dentro da Edge Function, depois
-- de validar o JWT do usuário e o catálogo permitido do agente.
