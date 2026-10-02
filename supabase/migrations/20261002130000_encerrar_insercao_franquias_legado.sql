-- A landing page de franquias foi atualizada para o Supabase próprio da
-- franquia. As tabelas antigas passam a ser arquivo somente para o banco.
begin;
revoke insert on table public.franquia_leads from anon, authenticated;
revoke insert on table public.franquia_campanha from anon, authenticated;
commit;
