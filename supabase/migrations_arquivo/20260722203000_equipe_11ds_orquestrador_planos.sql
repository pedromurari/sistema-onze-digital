-- Orquestrador auditável da Equipe 11DS. O modelo propõe planos, mas apenas o
-- servidor valida ferramentas e executa etapas depois da confirmação do usuário.

CREATE TABLE IF NOT EXISTS equipe_11ds_planos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  agente_responsavel_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id) ON DELETE RESTRICT,
  objetivo TEXT NOT NULL,
  resumo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_confirmacao'
    CHECK (status IN ('planejada', 'aguardando_confirmacao', 'executando', 'concluida', 'erro', 'cancelada')),
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  alteracoes_previstas TEXT[] NOT NULL DEFAULT '{}',
  efeitos_externos TEXT[] NOT NULL DEFAULT '{}',
  versao_hash TEXT NOT NULL,
  resultado_resumo TEXT,
  erro_mensagem TEXT,
  confirmado_em TIMESTAMPTZ,
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipe_11ds_planos_usuario_agente_idx
  ON equipe_11ds_planos (solicitante_id, agente_responsavel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS equipe_11ds_planos_agente_idx
  ON equipe_11ds_planos (agente_responsavel_id);
CREATE INDEX IF NOT EXISTS equipe_11ds_planos_status_idx
  ON equipe_11ds_planos (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_planos_abertos_usuario_agente_idx
  ON equipe_11ds_planos (solicitante_id, agente_responsavel_id)
  WHERE status IN ('aguardando_confirmacao', 'executando');

CREATE TABLE IF NOT EXISTS equipe_11ds_plano_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id UUID NOT NULL REFERENCES equipe_11ds_planos(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  ordem SMALLINT NOT NULL CHECK (ordem > 0),
  agente_id UUID REFERENCES equipe_11ds_agentes(id) ON DELETE SET NULL,
  agente_slug TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ferramenta TEXT NOT NULL,
  parametros JSONB NOT NULL DEFAULT '{}'::jsonb,
  depende_de TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada', 'aguardando', 'executando', 'corrigindo', 'concluida', 'erro', 'cancelada')),
  resultado JSONB,
  evidencia TEXT,
  erro_mensagem TEXT,
  tentativas SMALLINT NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 2),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plano_id, chave),
  UNIQUE (plano_id, ordem)
);

CREATE INDEX IF NOT EXISTS equipe_11ds_plano_etapas_plano_status_idx
  ON equipe_11ds_plano_etapas (plano_id, status, ordem);
CREATE INDEX IF NOT EXISTS equipe_11ds_plano_etapas_agente_idx
  ON equipe_11ds_plano_etapas (agente_id);

CREATE TABLE IF NOT EXISTS equipe_11ds_ferramenta_chamadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id UUID NOT NULL REFERENCES equipe_11ds_planos(id) ON DELETE CASCADE,
  etapa_id UUID NOT NULL REFERENCES equipe_11ds_plano_etapas(id) ON DELETE CASCADE,
  ferramenta TEXT NOT NULL,
  entrada_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'executando'
    CHECK (status IN ('executando', 'concluida', 'erro')),
  resultado JSONB,
  evidencia TEXT,
  erro_mensagem TEXT,
  duracao_ms INTEGER CHECK (duracao_ms IS NULL OR duracao_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS equipe_11ds_ferramenta_chamadas_etapa_idx
  ON equipe_11ds_ferramenta_chamadas (etapa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS equipe_11ds_ferramenta_chamadas_plano_idx
  ON equipe_11ds_ferramenta_chamadas (plano_id, created_at DESC);

CREATE TABLE IF NOT EXISTS equipe_11ds_memorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plano_id UUID REFERENCES equipe_11ds_planos(id) ON DELETE SET NULL,
  agente_id UUID REFERENCES equipe_11ds_agentes(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('empresa', 'cliente', 'agente', 'procedimento', 'campanha', 'identidade_visual', 'aprendizado', 'decisao')),
  escopo TEXT NOT NULL,
  caminho_obsidian TEXT NOT NULL,
  resumo TEXT NOT NULL,
  conteudo_hash TEXT NOT NULL,
  confianca NUMERIC(3,2) NOT NULL DEFAULT 0.80 CHECK (confianca BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'invalidada', 'removida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidada_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_usuario_tipo_idx
  ON equipe_11ds_memorias (solicitante_id, tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_plano_idx
  ON equipe_11ds_memorias (plano_id);
CREATE INDEX IF NOT EXISTS equipe_11ds_memorias_agente_idx
  ON equipe_11ds_memorias (agente_id);

ALTER TABLE equipe_11ds_chat_mensagens
  ADD COLUMN IF NOT EXISTS plano_id UUID REFERENCES equipe_11ds_planos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS equipe_11ds_chat_mensagens_plano_idx
  ON equipe_11ds_chat_mensagens (plano_id);

ALTER TABLE equipe_11ds_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_plano_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_ferramenta_chamadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_memorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their plans" ON equipe_11ds_planos;
CREATE POLICY "Users can view their plans"
  ON equipe_11ds_planos FOR SELECT TO authenticated
  USING (solicitante_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their plan steps" ON equipe_11ds_plano_etapas;
CREATE POLICY "Users can view their plan steps"
  ON equipe_11ds_plano_etapas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM equipe_11ds_planos p
    WHERE p.id = equipe_11ds_plano_etapas.plano_id
      AND p.solicitante_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view their tool calls" ON equipe_11ds_ferramenta_chamadas;
CREATE POLICY "Users can view their tool calls"
  ON equipe_11ds_ferramenta_chamadas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM equipe_11ds_planos p
    WHERE p.id = equipe_11ds_ferramenta_chamadas.plano_id
      AND p.solicitante_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Users can view their memories" ON equipe_11ds_memorias;
CREATE POLICY "Users can view their memories"
  ON equipe_11ds_memorias FOR SELECT TO authenticated
  USING (solicitante_id = (SELECT auth.uid()));

-- Escritas são exclusivas da service role dentro das Edge Functions.
