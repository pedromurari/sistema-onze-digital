
-- Add turma column to lancamento_30_leads
ALTER TABLE public.lancamento_30_leads ADD COLUMN IF NOT EXISTS turma text DEFAULT '#30';

-- Create npa_leads table
CREATE TABLE IF NOT EXISTS public.npa_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text NOT NULL,
  etapa text NOT NULL DEFAULT 'novo_npa',
  responsavel_id uuid,
  valor_investimento numeric,
  forma_pagamento text,
  como_conheceu text DEFAULT 'Outro',
  observacoes text,
  criado_por_id uuid,
  historico jsonb DEFAULT '[]'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  convertido_em timestamptz
);

ALTER TABLE public.npa_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full npa_leads" ON public.npa_leads FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores view npa_leads" ON public.npa_leads FOR SELECT TO authenticated USING (responsavel_id = auth.uid());
CREATE POLICY "Vendedores update npa_leads" ON public.npa_leads FOR UPDATE TO authenticated USING (responsavel_id = auth.uid());
CREATE POLICY "Vendedores insert npa_leads" ON public.npa_leads FOR INSERT TO authenticated WITH CHECK (responsavel_id IS NULL OR responsavel_id = auth.uid());
CREATE POLICY "Anon insert npa_leads" ON public.npa_leads FOR INSERT TO anon WITH CHECK (true);
CREATE TRIGGER npa_leads_updated_at BEFORE UPDATE ON public.npa_leads FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.npa_leads;

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  lead_type text NOT NULL DEFAULT 'formacao',
  direction text NOT NULL,
  content text NOT NULL,
  was_analyzed boolean DEFAULT false,
  analysis_temperatura integer,
  analysis_perfil text,
  analysis_etapa text,
  analysis_alerta text,
  analysis_mensagem_sugerida text,
  produto text DEFAULT 'formacao',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full chat_messages" ON public.chat_messages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores view chat_messages" ON public.chat_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM leads WHERE leads.id = chat_messages.lead_id AND leads.responsavel_id = auth.uid()));
CREATE POLICY "Vendedores insert chat_messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  responsavel_id uuid,
  prazo timestamptz,
  prioridade text NOT NULL DEFAULT 'media',
  categoria text DEFAULT 'vendas',
  produto text DEFAULT 'geral',
  lancamento text,
  status text NOT NULL DEFAULT 'a_fazer',
  criado_por_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full tasks" ON public.tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update tasks" ON public.tasks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  link text,
  lida boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create turmas table
CREATE TABLE IF NOT EXISTS public.turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  produto text NOT NULL DEFAULT 'formacao',
  status text NOT NULL DEFAULT 'ativo',
  data_inicio date,
  data_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full turmas" ON public.turmas FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view turmas" ON public.turmas FOR SELECT TO authenticated USING (true);
CREATE TRIGGER turmas_updated_at BEFORE UPDATE ON public.turmas FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Create produtos table
CREATE TABLE IF NOT EXISTS public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ativo',
  cor text NOT NULL DEFAULT '#BE123C',
  prompt_ia text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full produtos" ON public.produtos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Create processos table
CREATE TABLE IF NOT EXISTS public.processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL DEFAULT '',
  responsavel_padrao text,
  ordem integer DEFAULT 0,
  editado_por text,
  editado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full processos" ON public.processos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view processos" ON public.processos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER processos_updated_at BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Insert default data
INSERT INTO public.produtos (nome, slug, cor, prompt_ia) VALUES
('Formação em Psicanálise Integrativa', 'formacao', '#BE123C', NULL),
('NPA — Numerologia', 'npa', '#D97706', NULL)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.turmas (nome, produto, status) VALUES
('Lançamento #30', 'formacao', 'ativo'),
('Lançamento #31', 'formacao', 'ativo');

INSERT INTO public.processos (titulo, conteudo, responsavel_padrao, ordem) VALUES
('Fluxo de Atendimento de Lead (Formação)', E'Etapas:\n1. Receber lead\n2. Classificar perfil\n3. Msg 1 (Atenção)\n4. Aguardar resposta\n5. Msg 2 (Interesse)\n6. Qualificação\n7. Apresentação\n8. Fechamento', 'SDR', 1),
('Processo de Matrícula', E'Etapas:\n1. Qualificador financeiro\n2. Apresentar opções\n3. Enviar link de pagamento\n4. Confirmar pagamento\n5. Mover para Matrícula\n6. Handoff Rodrygo', 'Closer', 2),
('Protocolo de Follow Up', E'Timing:\n- 48h após último contato\n- 4-5 dias\n- 7-8 dias\n- 12-14 dias (encerramento estratégico)', 'SDR/Closer', 3),
('NPA — Processo de Venda', 'A ser preenchido pelo administrador.', NULL, 4);
