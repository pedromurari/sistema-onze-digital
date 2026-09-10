-- A tela do CRM lista "leads recentes" com `order by criado_em desc limit N`.
-- Sem índice em criado_em isso vira Seq Scan + top-N sort nas ~12k linhas de
-- `leads` a cada request. Numa instância sob pressão de CPU (o projeto roda no
-- compute Micro) esse scan estava levando 25-31s e estourando o statement_timeout
-- (57014) do PostgREST, o que disparava retry storm no front e deixava o app
-- preso em "Carregando...". Com o índice a consulta vira um index scan de N
-- linhas (~3 páginas), ~0,2s.
--
-- Já aplicada via MCP em 2026-09-10; este arquivo é só o registro no repo.

create index if not exists idx_leads_criado_em_desc
  on public.leads (criado_em desc);
