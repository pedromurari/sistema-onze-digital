-- Correcao do fechamento anterior: ele nao fechou nada.
--
-- `revoke select (api_key) ... from authenticated` foi aceito sem erro e nao teve efeito
-- nenhum. No Postgres, privilegio de TABELA cobre todas as colunas, e revogar uma coluna
-- nao abre buraco num grant de tabela — o teste com `set role authenticated` leu a chave
-- normalmente depois da migration anterior.
--
-- O jeito que funciona e o inverso: tirar o SELECT da tabela e devolver coluna a coluna,
-- deixando `api_key` de fora da lista. Feito assim, o Postgres nega no planejamento da
-- consulta, antes de qualquer RLS.
--
-- Nota para quem adicionar coluna nova nestas tabelas: ela nasce SEM leitura para o
-- navegador e precisa entrar no grant abaixo de proposito. Para tabela de segredo, esse
-- padrao (esquecer = fechado) e o certo.

-- ── evolution_config ────────────────────────────────────────────────────────
revoke select on public.evolution_config from authenticated;
grant  select (id, instance_name, api_url, ativo, prioridade, created_at, updated_at)
    on public.evolution_config to authenticated;

-- ── email_config ────────────────────────────────────────────────────────────
revoke select on public.email_config from authenticated;
grant  select (id, ativo, provider, from_name, from_email, created_at, updated_at)
    on public.email_config to authenticated;

-- Escrita continua inteira: o admin cadastra e troca a chave pela tela. So o caminho de
-- volta e que fecha.
