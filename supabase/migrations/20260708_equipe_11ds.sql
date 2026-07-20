-- Aba "Equipe 11DS": agentes de IA visuais organizados por time, que recebem ordens em
-- texto livre e executam via OpenAI (GPT + DALL-E). Entregas do tipo "post pro cliente"
-- continuam alimentando a aba "Post" existente (conteudo_posts).

CREATE TABLE IF NOT EXISTS equipe_11ds_times (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  emoji VARCHAR(10),
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipe_11ds_agentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  time_id UUID NOT NULL REFERENCES equipe_11ds_times(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  cargo VARCHAR(255),
  avatar_url TEXT,
  ordem INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'livre' CHECK (status IN ('livre', 'trabalhando', 'erro')),
  status_texto TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipe_11ds_tarefas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agente_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES profiles(id),
  tipo VARCHAR(20) NOT NULL DEFAULT 'avulso' CHECK (tipo IN ('post_cliente', 'avulso')),
  cliente_id UUID REFERENCES conteudo_clientes(id),
  ordem_texto TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'erro')),
  resposta_texto TEXT,
  anexos JSONB DEFAULT '[]',
  conteudo_post_id UUID REFERENCES conteudo_posts(id),
  erro_mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  iniciado_em TIMESTAMP WITH TIME ZONE,
  concluido_em TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_equipe_11ds_agentes_time_id ON equipe_11ds_agentes(time_id);
CREATE INDEX IF NOT EXISTS idx_equipe_11ds_tarefas_agente_id ON equipe_11ds_tarefas(agente_id);
CREATE INDEX IF NOT EXISTS idx_equipe_11ds_tarefas_status ON equipe_11ds_tarefas(status);

ALTER TABLE equipe_11ds_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_11ds_tarefas ENABLE ROW LEVEL SECURITY;

-- Somente equipe autenticada (sem policy anon) — restricao a admin fica na camada de app,
-- igual a aba "Post" hoje.
CREATE POLICY "Authenticated users can view equipe_11ds_times" ON equipe_11ds_times
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view equipe_11ds_agentes" ON equipe_11ds_agentes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can view equipe_11ds_tarefas" ON equipe_11ds_tarefas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create equipe_11ds_tarefas" ON equipe_11ds_tarefas
  FOR INSERT TO authenticated WITH CHECK (true);

-- Update de status/resposta/agente e feito pela edge function (service role), que ignora RLS.

-- Bucket publico para as imagens geradas pelos agentes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipe-11ds-criativos', 'equipe-11ds-criativos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload equipe-11ds-criativos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'equipe-11ds-criativos');
CREATE POLICY "Authenticated users can view equipe-11ds-criativos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'equipe-11ds-criativos');

-- Seed: time e agente iniciais.
INSERT INTO equipe_11ds_times (nome, slug, emoji, ordem)
VALUES ('Posts & Criativos', 'posts-criativos', '🎨', 0)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO equipe_11ds_agentes (time_id, nome, cargo, ordem, status)
SELECT id, 'Nina', 'Posts & Criativos', 0, 'livre'
FROM equipe_11ds_times WHERE slug = 'posts-criativos'
ON CONFLICT DO NOTHING;
