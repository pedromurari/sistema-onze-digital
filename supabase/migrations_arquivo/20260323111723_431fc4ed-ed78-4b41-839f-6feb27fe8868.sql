
-- Create table
CREATE TABLE public.lancamento_30_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  fase text NOT NULL DEFAULT 'planilha',
  fase_origem_fu text,
  status_maturacao text DEFAULT 'aguardando',
  dt_planilha timestamptz,
  dt_grupo_lancamento timestamptz,
  dt_grupo_oferta timestamptz,
  dt_matriculado timestamptz,
  dt_follow_up timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER handle_lancamento_30_updated_at
  BEFORE UPDATE ON public.lancamento_30_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.lancamento_30_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users full access
CREATE POLICY "Admins can do everything" ON public.lancamento_30_leads
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Vendedores can view" ON public.lancamento_30_leads
  FOR SELECT TO authenticated
  USING (true);

-- Allow anon insert/update for n8n via service_role or REST
CREATE POLICY "Allow anon insert" ON public.lancamento_30_leads
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update" ON public.lancamento_30_leads
  FOR UPDATE TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select" ON public.lancamento_30_leads
  FOR SELECT TO anon
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamento_30_leads;
