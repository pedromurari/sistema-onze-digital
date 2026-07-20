-- Tarefas recorrentes da Equipe 11DS: ordens (avulsas ou de post pro cliente) que
-- o usuario marca para repetir todo dia, alem da rotina automatica ja existente
-- baseada em conteudo_clientes.ativo.

CREATE TABLE IF NOT EXISTS equipe_11ds_recorrentes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agente_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL DEFAULT 'avulso' CHECK (tipo IN ('post_cliente', 'avulso')),
  cliente_id UUID REFERENCES conteudo_clientes(id),
  ordem_texto TEXT NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  criado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE equipe_11ds_tarefas ADD COLUMN IF NOT EXISTS recorrente_id UUID REFERENCES equipe_11ds_recorrentes(id);

CREATE INDEX IF NOT EXISTS idx_equipe_11ds_recorrentes_agente_id ON equipe_11ds_recorrentes(agente_id);
CREATE INDEX IF NOT EXISTS idx_equipe_11ds_tarefas_recorrente_id ON equipe_11ds_tarefas(recorrente_id);

ALTER TABLE equipe_11ds_recorrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view equipe_11ds_recorrentes" ON equipe_11ds_recorrentes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage equipe_11ds_recorrentes" ON equipe_11ds_recorrentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
