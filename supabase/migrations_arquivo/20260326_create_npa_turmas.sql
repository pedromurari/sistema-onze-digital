-- Create NPA tables with dynamic turmas
-- NPA #01 table
CREATE TABLE public.npa_01_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text NOT NULL,
  etapa text NOT NULL DEFAULT 'novo_npa',
  responsavel_id uuid,
  valor_investimento numeric DEFAULT 297,
  forma_pagamento text,
  como_conheceu text DEFAULT 'Outro',
  observacoes text,
  criado_por_id uuid,
  historico jsonb DEFAULT '[]'::jsonb,
  turma text DEFAULT '01',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  convertido_em timestamptz
);

ALTER TABLE public.npa_01_leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER handle_npa_01_updated_at BEFORE UPDATE ON public.npa_01_leads FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE POLICY "Admins npa_01" ON public.npa_01_leads FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores view npa_01" ON public.npa_01_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vendedores insert npa_01" ON public.npa_01_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Vendedores update npa_01" ON public.npa_01_leads FOR UPDATE TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.npa_01_leads;

-- NPA #02 table
CREATE TABLE public.npa_02_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text NOT NULL,
  etapa text NOT NULL DEFAULT 'novo_npa',
  responsavel_id uuid,
  valor_investimento numeric DEFAULT 297,
  forma_pagamento text,
  como_conheceu text DEFAULT 'Outro',
  observacoes text,
  criado_por_id uuid,
  historico jsonb DEFAULT '[]'::jsonb,
  turma text DEFAULT '02',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  convertido_em timestamptz
);

ALTER TABLE public.npa_02_leads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER handle_npa_02_updated_at BEFORE UPDATE ON public.npa_02_leads FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE POLICY "Admins npa_02" ON public.npa_02_leads FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Vendedores view npa_02" ON public.npa_02_leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vendedores insert npa_02" ON public.npa_02_leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Vendedores update npa_02" ON public.npa_02_leads FOR UPDATE TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.npa_02_leads;
