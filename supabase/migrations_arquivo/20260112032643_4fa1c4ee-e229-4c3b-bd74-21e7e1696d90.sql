-- Fix lead stage updates: leads table uses `atualizado_em`, but an old trigger expects `updated_at`.

-- Drop incorrect trigger
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;

-- Create a dedicated trigger function for leads
CREATE OR REPLACE FUNCTION public.handle_leads_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

-- Create correct trigger
CREATE TRIGGER update_leads_atualizado_em
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.handle_leads_atualizado_em();
