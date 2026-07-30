-- Multi-page support for the Mapa Mental tab: each row is an independent
-- board (mapa/funil/metas/livre). mind_map_nodes/mind_map_connections already
-- had an unused "workspace" text column; it now acts as the FK-by-value into
-- mind_map_pages.workspace, scoping every node/edge to a single page.

CREATE TABLE IF NOT EXISTS public.mind_map_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  nome TEXT NOT NULL,
  emoji TEXT DEFAULT '🧠',
  cor TEXT DEFAULT '#AC1131',
  descricao TEXT,
  tipo TEXT DEFAULT 'mapa' CHECK (tipo IN ('mapa','funil','metas','livre')),
  ordem INTEGER DEFAULT 0,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Página padrão para os dados legados (workspace = 'empresa')
INSERT INTO public.mind_map_pages (workspace, nome, emoji, tipo, ordem)
VALUES ('empresa', 'Mapa Geral', '🧠', 'mapa', 0)
ON CONFLICT (workspace) DO NOTHING;

ALTER TABLE public.mind_map_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mind_map_pages_select" ON public.mind_map_pages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mind_map_pages_insert" ON public.mind_map_pages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "mind_map_pages_update" ON public.mind_map_pages
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "mind_map_pages_delete" ON public.mind_map_pages
  FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.mind_map_pages;
