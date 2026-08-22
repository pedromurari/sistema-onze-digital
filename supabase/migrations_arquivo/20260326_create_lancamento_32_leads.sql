-- Create table lancamento_32_leads
CREATE TABLE public.lancamento_32_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  Nome text,
  "E-mail" text,
  Whatsapp text,
  Data timestamptz,
  "No Grupo?" text,
  "Grupo de Oferta" text,
  "Follow Up 01" text,
  "Follow Up 02" text,
  "Follow Up 03" text,
  turma text DEFAULT '#32',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER handle_lancamento_32_updated_at
  BEFORE UPDATE ON public.lancamento_32_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.lancamento_32_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users full access
CREATE POLICY "Admins can do everything" ON public.lancamento_32_leads
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Vendedores can view" ON public.lancamento_32_leads
  FOR SELECT TO authenticated
  USING (true);

-- Allow anon insert/update for n8n via service_role or REST
CREATE POLICY "Allow anon insert" ON public.lancamento_32_leads
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update" ON public.lancamento_32_leads
  FOR UPDATE TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select" ON public.lancamento_32_leads
  FOR SELECT TO anon
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento_32_leads;
