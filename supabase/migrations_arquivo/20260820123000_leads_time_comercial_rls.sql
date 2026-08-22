-- Time Comercial (src/components/crm/TimeComercial.tsx) atribui dono via a coluna
-- de texto `leads.vendedor` (nome), não via `responsavel_id` (usado pelo Pipeline/
-- Leads Diretos). A policy de SELECT/UPDATE só olhava responsavel_id = auth.uid(),
-- então todo vendedor logado via Supabase Auth via zero leads do Time Comercial,
-- mesmo os já atribuídos a ele por nome. Restrito a origem = 'Time Comercial' pra
-- não abrir os leads Diretos (que ficam null em `vendedor`) pra todo mundo.
DROP POLICY IF EXISTS "select_leads" ON public.leads;
CREATE POLICY "select_leads" ON public.leads
FOR SELECT TO authenticated
USING (
  auth.uid() = responsavel_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    origem = 'Time Comercial'
    AND (vendedor IS NULL OR vendedor = (SELECT nome FROM public.profiles WHERE id = auth.uid()))
  )
);

DROP POLICY IF EXISTS "update_leads" ON public.leads;
CREATE POLICY "update_leads" ON public.leads
FOR UPDATE TO authenticated
USING (
  auth.uid() = responsavel_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    origem = 'Time Comercial'
    AND (vendedor IS NULL OR vendedor = (SELECT nome FROM public.profiles WHERE id = auth.uid()))
  )
);
