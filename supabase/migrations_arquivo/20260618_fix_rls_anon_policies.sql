-- Remover policies anon de tabelas de leads — OWASP A01: Broken Access Control
-- Motivação: qualquer pessoa com a anon key pública pode inserir/modificar leads.
-- Alternativa: usar Edge Function com service_role (já disponível: webhook-leads).
-- Se n8n precisar acessar diretamente, deve usar a service_role key ou uma API key dedicada.

-- lancamento_30_leads
DROP POLICY IF EXISTS "Allow anon insert" ON public.lancamento_30_leads;
DROP POLICY IF EXISTS "Allow anon update" ON public.lancamento_30_leads;
DROP POLICY IF EXISTS "Allow anon select" ON public.lancamento_30_leads;

-- lancamento_32_leads
DROP POLICY IF EXISTS "Allow anon insert" ON public.lancamento_32_leads;
DROP POLICY IF EXISTS "Allow anon update" ON public.lancamento_32_leads;
DROP POLICY IF EXISTS "Allow anon select" ON public.lancamento_32_leads;

-- Garantir que lancamento_leads (se existir) também não tenha anon policies
DROP POLICY IF EXISTS "Allow anon insert" ON public.lancamento_leads;
DROP POLICY IF EXISTS "Allow anon update" ON public.lancamento_leads;
DROP POLICY IF EXISTS "Allow anon select" ON public.lancamento_leads;
