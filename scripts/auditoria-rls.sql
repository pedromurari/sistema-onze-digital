-- ============================================================================
-- Auditoria de RLS — Sistema 11ds
--
-- Roda SÓ LEITURA: é uma consulta ao catálogo do Postgres. Pode ser executada em
-- produção sem risco — não insere, não atualiza, não dispara gatilho.
--
-- COMO USAR: cole no SQL Editor do Supabase, ou
--   psql "$DATABASE_URL" -f scripts/auditoria-rls.sql
--
-- O QUE PEGA: tabela que entrou sem proteção, e tabela que tem regra boa mas continua
-- com uma policy frouxa ao lado. Este segundo caso é o traiçoeiro — **RLS soma com OU**,
-- então a policy mais frouxa sempre vence e a restritiva vira enfeite. Foi o que
-- aconteceu em `tarefas`, `turmas` e `user_access_permissions`: alguém escreveu a regra
-- certa em algum momento, a antiga ficou, e o acesso continuou aberto.
--
-- O QUE NÃO PEGA: policy escrita errada. Para isso é preciso contar linha por perfil —
-- ver `scripts/auditoria-acesso-por-perfil.sql`.
-- ============================================================================

with excecoes(tabela, motivo) as (values
  -- Somente service_role, de propósito: RLS ligada e nenhuma policy = ninguém entra.
  ('idm_criativos_log',   'log sem consumidor no app'),
  ('leads_ia_debounce',   'fila interna do SDR, só edge function'),
  ('sheet_leads_33',      'espelho bruto de planilha, sem consumidor'),
  ('subtarefas',          'tabela vazia, sem consumidor'),
  -- Leitura ampla aceita conscientemente: catálogo interno, sem dado pessoal.
  -- Estas passaram por `aplicar_camada_catalogo`: leitura para qualquer logado,
  -- escrita só para gestor/admin.
  ('turmas',              'catálogo — 14 telas leem'),
  ('turma_responsaveis',  'catálogo'),
  ('responsaveis',        'catálogo'),
  ('bonus_tipos',         'catálogo'),
  ('bonus_turmas',        'catálogo'),
  ('conteudo_clientes',   'catálogo'),
  ('kanban_colunas',      'configuração de quadro'),
  ('ddd_regioes',         'tabela de referência de DDD'),
  ('produtos',            'catálogo'),
  ('payment_method_rates','tabela de taxas, sem dado pessoal'),
  ('cursos',              'catálogo'),
  ('fontes',              'catálogo'),
  ('crm_config',          'config lida por todas as telas'),
  ('app_recursos',        'catálogo da própria matriz de permissão'),
  -- Leitura aberta necessária pelo produto.
  ('evolution_config',         'PENDÊNCIA conhecida: guarda a API key e 10 telas leem'),
  ('evolution_task_config',    'idem'),
  ('evolution_conexao_eventos','idem'),
  -- Leitura anônima necessária: o redirecionador de link encurtado /ir/:slug precisa
  -- resolver o slug antes de qualquer login.
  ('parceiros_links',     'redirecionador público /ir/:slug')
),
tabelas as (
  select c.oid, c.relname, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
),
avaliacao as (
  select
    t.relname,
    t.rls,
    (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = t.relname) as policies,
    -- Policy que libera geral. `auth.role() = 'authenticated'` é tão aberto quanto `true`:
    -- significa "qualquer pessoa logada".
    exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.relname
         and p.cmd in ('SELECT', 'ALL')
         and coalesce(p.qual, '') in ('true', '(auth.role() = ''authenticated''::text)')
         and (p.roles::text like '%authenticated%' or p.roles::text like '%public%')
    ) as tem_policy_frouxa,
    exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.relname
         and p.roles::text like '%anon%' and p.cmd in ('SELECT', 'UPDATE', 'DELETE')
    ) as anon_le_ou_escreve,
    greatest((select reltuples::bigint from pg_class where oid = t.oid), 0) as linhas_aprox
  from tabelas t
)
select
  case
    when not rls                then '1. SEM RLS — qualquer um lê'
    when anon_le_ou_escreve     then '2. ANÔNIMO lê ou escreve'
    when policies = 0           then '3. RLS sem policy (só service_role)'
    when tem_policy_frouxa      then '4. Policy frouxa convivendo — ela vence'
  end                            as situacao,
  relname                        as tabela,
  linhas_aprox
from avaliacao
where (not rls or anon_le_ou_escreve or policies = 0 or tem_policy_frouxa)
  and relname not in (select tabela from excecoes)
order by situacao, linhas_aprox desc, relname;

-- Zero linhas = toda tabela ou passa pela matriz de permissão, ou está na lista de
-- exceções aprovadas acima. Tabela nova desprotegida aparece aqui.
