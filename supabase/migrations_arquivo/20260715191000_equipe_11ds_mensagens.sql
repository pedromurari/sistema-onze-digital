-- Thread de conversa visivel entre os agentes de uma tarefa -- cada passo da
-- pipeline (Gestor, Estrategista, Redator, Diretor de Arte, Nina) registra uma
-- fala aqui, na ordem em que aconteceu. Mesmo padrao de RLS de equipe_11ds_tarefas.

CREATE TABLE equipe_11ds_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES equipe_11ds_tarefas(id) ON DELETE CASCADE,
  agente_id UUID NOT NULL REFERENCES equipe_11ds_agentes(id),
  tipo TEXT NOT NULL DEFAULT 'mensagem' CHECK (tipo IN ('mensagem', 'alerta', 'aprovacao')),
  conteudo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX equipe_11ds_mensagens_tarefa_idx ON equipe_11ds_mensagens (tarefa_id, created_at);

ALTER TABLE equipe_11ds_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mensagens" ON equipe_11ds_mensagens
  FOR SELECT TO authenticated USING (true);
-- Insert/update apenas via service role (edge function), igual equipe_11ds_tarefas.
