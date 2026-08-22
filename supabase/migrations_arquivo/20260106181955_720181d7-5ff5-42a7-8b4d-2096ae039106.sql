-- Create leads table for secure server-side storage
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados Pessoais
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT NOT NULL,
  data_nascimento DATE,
  cpf TEXT,
  cidade TEXT,
  estado TEXT,
  
  -- Interesse Acadêmico
  formacao_academica TEXT,
  area_atuacao TEXT,
  ja_fez_psicanalise BOOLEAN DEFAULT false,
  curso_interesse TEXT NOT NULL,
  
  -- Comercial
  como_conheceu TEXT NOT NULL,
  valor_investimento NUMERIC,
  forma_pagamento TEXT,
  etapa TEXT NOT NULL DEFAULT 'novo',
  responsavel_id UUID,
  proxima_acao TEXT,
  data_proxima_acao TIMESTAMPTZ,
  
  -- Observações
  observacoes TEXT,
  
  -- Metadados
  criado_por_id UUID,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  convertido_em TIMESTAMPTZ,
  
  -- Histórico stored as JSONB array
  historico JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Admins can view all leads
CREATE POLICY "Admins can view all leads" ON public.leads
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Vendedores can view only their assigned leads
CREATE POLICY "Vendedores can view assigned leads" ON public.leads
FOR SELECT TO authenticated
USING (responsavel_id = auth.uid());

-- Admins can insert leads
CREATE POLICY "Admins can insert leads" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vendedores can insert leads (assigned to themselves or unassigned)
CREATE POLICY "Vendedores can insert leads" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  responsavel_id IS NULL OR 
  responsavel_id = auth.uid()
);

-- Admins can update any lead
CREATE POLICY "Admins can update leads" ON public.leads
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Vendedores can update only their assigned leads
CREATE POLICY "Vendedores can update assigned leads" ON public.leads
FOR UPDATE TO authenticated
USING (responsavel_id = auth.uid());

-- Admins can delete leads
CREATE POLICY "Admins can delete leads" ON public.leads
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for auto-updating atualizado_em
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create courses table
CREATE TABLE public.cursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  valor_padrao NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view courses
CREATE POLICY "Authenticated users can view courses" ON public.cursos
FOR SELECT TO authenticated
USING (true);

-- Only admins can manage courses
CREATE POLICY "Admins can insert courses" ON public.cursos
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update courses" ON public.cursos
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete courses" ON public.cursos
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create sources (fontes) table
CREATE TABLE public.fontes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fontes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view sources
CREATE POLICY "Authenticated users can view sources" ON public.fontes
FOR SELECT TO authenticated
USING (true);

-- Only admins can manage sources
CREATE POLICY "Admins can insert sources" ON public.fontes
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sources" ON public.fontes
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sources" ON public.fontes
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create CRM config table
CREATE TABLE public.crm_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_out TEXT,
  webhook_in TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view config
CREATE POLICY "Authenticated users can view config" ON public.crm_config
FOR SELECT TO authenticated
USING (true);

-- Only admins can manage config
CREATE POLICY "Admins can insert config" ON public.crm_config
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update config" ON public.crm_config
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));