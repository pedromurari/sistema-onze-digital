-- Sprint 1.2b — Matriz de acesso no banco, no lugar das 20 colunas booleanas.
-- recurso (catalogo) x papel x acao, com override por pessoa.
-- NAO muda o acesso de ninguem: reproduz o estado atual no modelo novo. Apertar e a 1.3.

create table public.app_recursos (
  chave     text primary key,
  modulo    text        not null,
  rotulo    text        not null,
  ordem     integer     not null default 100,
  criado_em timestamptz not null default now()
);

create table public.role_permissoes (
  papel   public.app_role not null,
  recurso text            not null references public.app_recursos(chave) on delete cascade,
  acao    text            not null check (acao in ('ver','editar','excluir','ver_todos')),
  primary key (papel, recurso, acao)
);

create table public.user_permissao_override (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  recurso     text        not null references public.app_recursos(chave) on delete cascade,
  acao        text        not null check (acao in ('ver','editar','excluir','ver_todos')),
  permitido   boolean     not null,
  definido_em timestamptz not null default now(),
  primary key (user_id, recurso, acao)
);

comment on table public.app_recursos is
  'Catalogo de telas/recursos protegidos. Tela nova = uma linha aqui, nao uma coluna nova.';
comment on table public.role_permissoes is
  'O que cada papel pode por padrao. Editavel pelo TeamManagement.';
comment on table public.user_permissao_override is
  'Excecao por pessoa. Vence o padrao do papel, para os dois lados.';

insert into public.app_recursos (chave, modulo, rotulo, ordem) values
  ('dashboard',         'Geral',         'Início',                 10),
  ('pipeline',          'Comercial',     'Leads (Pipeline)',       20),
  ('time_comercial',    'Comercial',     'Time Comercial',         21),
  ('franquia_psi',      'Comercial',     'IDM PSI Franquias',      22),
  ('aquecimento_chips', 'Comercial',     'Aquecimento de Chips',   23),
  ('lancamentos',       'Lançamentos',   'Lançamentos',            30),
  ('funil_lancamento',  'Lançamentos',   'Funil de Lançamento',    31),
  ('disparos_monitor',  'Lançamentos',   'Monitor de Disparos',    32),
  ('chat_conversas',    'Lançamentos',   'Chat / Conversas',       33),
  ('npa',               'Eventos',       'NPA',                    40),
  ('aula_secreta',      'Eventos',       'Aula Secreta',           41),
  ('financeiro',        'Financeiro',    'Financeiro',             50),
  ('financeiro_cfo',    'Financeiro',    'Análise CFO',            51),
  ('balanco',           'Financeiro',    'Balanço',                52),
  ('cobranca',          'Financeiro',    'Cobrança',               53),
  ('operacoes',         'Operações',     'Tarefas e calendários',  60),
  ('mapa_mental',       'Operações',     'Mapa Mental',            61),
  ('rodrygo',           'Operações',     'Rodrygo',                62),
  ('posts',             'Mídia',         'Posts',                  70),
  ('reels_idm',         'Mídia',         'Reels IDM',              71),
  ('equipe_11ds',       'Mídia',         'Equipe 11DS',            72),
  ('parceiros',         'Parceiros',     'Parceiros',              80),
  ('produtos',          'Configuração',  'Produtos',               90),
  ('team',              'Configuração',  'Equipe e permissões',    91),
  ('settings',          'Configuração',  'Configurações',          92);

-- admin: tudo (espelha o `if (isAdmin) return true` do canAccessView)
insert into public.role_permissoes (papel, recurso, acao)
select 'admin'::public.app_role, r.chave, a.acao
from public.app_recursos r
cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao);

-- gestor (papel novo, ninguem usa ainda): opera o negocio, nao mexe em configuracao
insert into public.role_permissoes (papel, recurso, acao)
select 'gestor'::public.app_role, r.chave, a.acao
from public.app_recursos r
cross join (values ('ver'),('editar'),('ver_todos')) a(acao)
where r.chave not in ('settings','team','produtos','equipe_11ds','reels_idm','posts','parceiros');

-- vendedor e parceiro espelham DEFAULT_NON_ADMIN_PERMISSIONS: hoje getDefaultPermissions
-- devolve o mesmo default pra qualquer papel != admin, entao parceiro recebe o mesmo que
-- vendedor. Preservado aqui e sinalizado ao dono.
insert into public.role_permissoes (papel, recurso, acao)
select p.papel::public.app_role, r.recurso, a.acao
from (values ('vendedor'),('parceiro')) p(papel)
cross join (values
  ('dashboard'),('pipeline'),('lancamentos'),('npa'),('aula_secreta'),
  ('financeiro'),('balanco'),('operacoes'),('mapa_mental'),('rodrygo'),
  ('time_comercial'),('franquia_psi')
) r(recurso)
cross join (values ('ver'),('editar')) a(acao);

insert into public.role_permissoes (papel, recurso, acao)
select p.papel::public.app_role, r.recurso, 'ver_todos'
from (values ('vendedor'),('parceiro')) p(papel)
cross join (values ('lancamentos'),('financeiro')) r(recurso);

insert into public.role_permissoes (papel, recurso, acao)
select 'professora'::public.app_role, r.recurso, a.acao
from (values ('dashboard'),('operacoes'),('mapa_mental')) r(recurso)
cross join (values ('ver'),('editar')) a(acao);

-- Excecoes ja cadastradas viram override, so onde divergem do padrao do papel.
-- Admin fica de fora: canAccessView retorna true antes de olhar as flags, entao as
-- flags de admin sao decorativas — copia-las viraria restricao que hoje nao existe.
with mapa(recurso, coluna) as (values
  ('dashboard',        'can_view_dashboard'),
  ('pipeline',         'can_view_pipeline'),
  ('lancamentos',      'can_view_lancamentos'),
  ('npa',              'can_view_npa'),
  ('aula_secreta',     'can_view_aula_secreta'),
  ('financeiro',       'can_view_financeiro'),
  ('financeiro_cfo',   'can_view_financeiro_cfo'),
  ('balanco',          'can_view_balanco'),
  ('cobranca',         'can_view_cobranca'),
  ('operacoes',        'can_view_operacoes'),
  ('mapa_mental',      'can_view_mapa_mental'),
  ('rodrygo',          'can_view_rodrygo'),
  ('team',             'can_view_team'),
  ('settings',         'can_view_settings'),
  ('time_comercial',   'can_view_time_comercial'),
  ('franquia_psi',     'can_view_franquia_psi'),
  ('funil_lancamento', 'can_view_cobranca'),
  ('disparos_monitor', 'can_view_cobranca'),
  ('chat_conversas',   'can_view_cobranca')
),
atual as (
  select ap.user_id, ur.role as papel, m.recurso,
         (to_jsonb(ap) ->> m.coluna)::boolean as permitido
  from public.user_access_permissions ap
  join public.user_roles ur on ur.user_id = ap.user_id
  cross join mapa m
  where (to_jsonb(ap) ->> m.coluna) is not null
    and ur.role <> 'admin'::public.app_role
)
insert into public.user_permissao_override (user_id, recurso, acao, permitido)
select a.user_id, a.recurso, 'ver', a.permitido
from atual a
where a.permitido is distinct from exists (
  select 1 from public.role_permissoes rp
  where rp.papel = a.papel and rp.recurso = a.recurso and rp.acao = 'ver'
)
on conflict do nothing;

create or replace function public.tem_permissao(p_recurso text, p_acao text default 'ver')
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select o.permitido
       from public.user_permissao_override o
      where o.user_id = auth.uid() and o.recurso = p_recurso and o.acao = p_acao),
    (select true
       from public.role_permissoes rp
       join public.user_roles ur on ur.role = rp.papel
      where ur.user_id = auth.uid() and rp.recurso = p_recurso and rp.acao = p_acao
      limit 1),
    false
  );
$fn$;

comment on function public.tem_permissao(text, text) is
  'Override da pessoa vence o padrao do papel; sem nenhum dos dois, nega. Usar nas policies de RLS.';

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$ select public.has_role(auth.uid(), 'admin'::public.app_role); $fn$;

create or replace function public.is_gestor()
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role);
$fn$;

create or replace function public.minhas_permissoes()
returns table (recurso text, acao text, permitido boolean)
language sql stable security definer set search_path = public, pg_temp
as $fn$
  select r.chave,
         a.acao,
         coalesce(
           (select o.permitido from public.user_permissao_override o
             where o.user_id = auth.uid() and o.recurso = r.chave and o.acao = a.acao),
           exists (select 1 from public.role_permissoes rp
                    join public.user_roles ur on ur.role = rp.papel
                   where ur.user_id = auth.uid() and rp.recurso = r.chave and rp.acao = a.acao)
         )
  from public.app_recursos r
  cross join (values ('ver'),('editar'),('excluir'),('ver_todos')) a(acao);
$fn$;

alter table public.app_recursos            enable row level security;
alter table public.role_permissoes         enable row level security;
alter table public.user_permissao_override enable row level security;

create policy app_recursos_logado_le on public.app_recursos
  for select to authenticated using (true);
create policy app_recursos_admin_escreve on public.app_recursos
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy role_permissoes_admin on public.role_permissoes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy user_override_le_o_proprio on public.user_permissao_override
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_override_admin_escreve on public.user_permissao_override
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.app_recursos to authenticated;
grant select, insert, update, delete on public.role_permissoes to authenticated;
grant select, insert, update, delete on public.user_permissao_override to authenticated;
grant execute on function public.tem_permissao(text, text) to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.is_gestor()         to authenticated;
grant execute on function public.minhas_permissoes() to authenticated;
