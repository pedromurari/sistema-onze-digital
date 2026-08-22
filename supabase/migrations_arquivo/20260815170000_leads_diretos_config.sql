-- Config editável da tela Leads Diretos (hoje só a meta mensal de
-- matrículas, que era um número fixo no código). Admin edita pelo próprio
-- painel de estatísticas.

CREATE TABLE IF NOT EXISTS public.leads_diretos_config (
  id                   TEXT PRIMARY KEY DEFAULT 'default',
  meta_matriculas_mes  INTEGER NOT NULL DEFAULT 40,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads_diretos_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leads_diretos_config' AND policyname='leads_diretos_config_authenticated') THEN
    CREATE POLICY "leads_diretos_config_authenticated" ON public.leads_diretos_config
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.leads_diretos_config (id, meta_matriculas_mes) VALUES ('default', 40) ON CONFLICT (id) DO NOTHING;
