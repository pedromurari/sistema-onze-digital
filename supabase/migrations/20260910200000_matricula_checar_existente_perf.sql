-- A ficha de matrícula pública (/matricula/:vendedor, /997 etc.) chama
-- matricula_time_comercial_criar -> matricula_checar_existente, que faz
--   select ... from leads where email = $1 or whatsapp ilike '%'||$2||'%'
-- Sem índice em leads.email nem em leads.whatsapp, isso é um Seq Scan das
-- ~12k linhas de `leads` com ILIKE por linha, a CADA envio de ficha. O papel
-- `anon` (usado pelo endpoint público, sem login) tem statement_timeout = 3s,
-- então sob qualquer carga na instância Micro a RPC estoura o timeout (57014)
-- e o cliente vê "Ocorreu um erro, tente novamente" — foi o que aconteceu com
-- a cliente Cilene, repetidamente, em 2026-09-10.
--
-- Aplicada via MCP em 2026-09-10; este arquivo é o registro no repo.
-- Depois: BitmapOr dos 2 índices, execução ~0,5ms.

-- 1) email: equality -> btree
create index if not exists idx_leads_email on public.leads (email);

-- 2) whatsapp: usado com ILIKE '%...%' -> trigram (pg_trgm já instalado)
create index if not exists idx_leads_whatsapp_trgm
  on public.leads using gin (whatsapp gin_trgm_ops);

-- 3) rede de segurança: a RPC é SECURITY DEFINER; fixa um teto de 20s próprio
--    dela, acima dos 3s do `anon`, pra uma lentidão pontual não derrubar a
--    matrícula. (Só afeta esta função.)
alter function public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text,
  text, integer, text, text, text, numeric, numeric, text, date
) set statement_timeout to '20s';
