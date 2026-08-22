-- Fecha a exposicao das chaves de API. O problema NAO era so o frontend.
--
-- ── O QUE ESTAVA ABERTO ─────────────────────────────────────────────────────
-- `evolution_config` tinha DUAS politicas: `evolution_config_admin_escreve` (ALL,
-- is_admin) e `evolution_config_ver` (SELECT, USING true). Politicas sao OR: a
-- permissiva vencia. Qualquer pessoa logada — a vendedora, a professora — lia a
-- tabela inteira, `api_key` incluida, chamando a API direto. A camada A da sprint 1
-- nunca cobriu esta tabela; a politica `true` e anterior e ficou por baixo do radar.
--
-- A chave da Evolution manda WhatsApp em nome da empresa. Vazada, da para disparar
-- por qualquer numero conectado e ler as conversas.
--
-- `email_config.api_key` (Resend/SendGrid/Brevo) tinha o mesmo problema em grau menor:
-- a politica ja exigia `settings/ver`, mas a tela carregava a chave para dentro do
-- navegador e a mostrava num input.
--
-- ── COMO SE FECHA ───────────────────────────────────────────────────────────
-- Politica de linha nao resolve isto: quem pode ver a LINHA veria a COLUNA junto.
-- A trava certa e privilegio de coluna, que o Postgres aplica antes da RLS. Depois
-- disto, `select api_key from evolution_config` devolve "permission denied for
-- column api_key" mesmo para admin logado no navegador.
--
-- As 26 edge functions que precisam da chave usam `service_role`, que ignora RLS e
-- privilegio de coluna — nenhuma quebra. A leitura pelo navegador passa a ser feita
-- pela edge function `evo-proxy`, que confere permissao e injeta a chave.

-- ── 1. A trava: ninguem no navegador le a coluna da chave ───────────────────
revoke select (api_key) on public.evolution_config from authenticated, anon;
revoke select (api_key) on public.email_config     from authenticated, anon;

-- Escrever continua permitido (o admin cadastra/troca a chave pela tela de ajustes);
-- so a LEITURA de volta e que morre. E um caminho de mao unica, de proposito.

-- ── 2. anon nao tem o que fazer numa tabela de segredo ──────────────────────
-- Tinha INSERT nas duas. Nao havia politica, entao nada passava de fato, mas grant
-- pendurado e pegadinha: no dia em que alguem criar uma politica para anon, isso vira
-- porta aberta. Some com o grant.
revoke all on public.evolution_config from anon;
revoke all on public.email_config     from anon;

-- ── 3. Trocar o `USING (true)` por quem realmente precisa da lista ──────────
-- Varias telas legitimas listam instancias: o Chat do Time Comercial (vendedora),
-- o monitor de disparos, o assistente de lancamento e os ajustes. Todas precisam do
-- NOME e da URL — nenhuma precisa da chave, que agora nem vem.
drop policy if exists evolution_config_ver on public.evolution_config;

create policy evolution_config_ver on public.evolution_config
  for select to authenticated
  using (
    tem_permissao('settings',         'ver')
    or tem_permissao('time_comercial',   'ver')
    or tem_permissao('disparos_monitor', 'ver')
    or tem_permissao('lancamentos',      'ver')
    or tem_permissao('funil_lancamento', 'ver')
  );

comment on policy evolution_config_ver on public.evolution_config is
  'Lista de instancias para as telas que disparam ou conversam. A api_key NAO vem junto: o privilegio de leitura da coluna foi revogado.';

-- ── 4. A tela de email precisa saber SE ha chave, sem receber a chave ───────
create or replace function public.email_config_resumo()
returns table (
  id          uuid,
  ativo       boolean,
  provider    text,
  from_name   text,
  from_email  text,
  chave_salva boolean
)
language sql
security definer
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select e.id, e.ativo, e.provider, e.from_name, e.from_email,
         (e.api_key is not null and length(trim(e.api_key)) > 0) as chave_salva
    from public.email_config e
   where public.tem_permissao('settings', 'ver')   -- security definer: a checagem e aqui
     and e.ativo
   order by e.created_at desc
   limit 1;
$fn$;

revoke execute on function public.email_config_resumo() from public, anon;
grant  execute on function public.email_config_resumo() to authenticated;

comment on function public.email_config_resumo() is
  'Configuracao de email SEM a chave — devolve so se existe uma salva. A tela nunca recebe o valor.';
