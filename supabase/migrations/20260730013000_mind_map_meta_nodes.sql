-- Nós do tipo "meta": valor alvo, valor atual e unidade para a barra de progresso.
ALTER TABLE public.mind_map_nodes
  ADD COLUMN IF NOT EXISTS meta_alvo DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS meta_atual DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS meta_unidade TEXT DEFAULT '';

-- Índice para o filtro por workspace, que agora roda em toda leitura do mapa.
CREATE INDEX IF NOT EXISTS mind_map_nodes_workspace_idx
  ON public.mind_map_nodes (workspace);
CREATE INDEX IF NOT EXISTS mind_map_connections_workspace_idx
  ON public.mind_map_connections (workspace);
