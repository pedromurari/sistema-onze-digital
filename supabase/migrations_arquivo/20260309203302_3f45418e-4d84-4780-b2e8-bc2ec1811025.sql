
-- Messages table for chat
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conteudo text NOT NULL,
  remetente text NOT NULL CHECK (remetente IN ('usuario', 'lead')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with messages" ON public.messages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Vendedores can view messages for their leads" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.leads WHERE leads.id = messages.lead_id AND leads.responsavel_id = auth.uid())
);

CREATE POLICY "Vendedores can insert messages for their leads" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.leads WHERE leads.id = messages.lead_id AND leads.responsavel_id = auth.uid())
);

-- Message templates table
CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates" ON public.message_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage templates" ON public.message_templates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
