-- Sprint 3a — Identidade canonica de pessoa (estrutura).
--
-- Hoje o mesmo ser humano existe varias vezes: 29.171 linhas de pessoa espalhadas por sete
-- tabelas, que colapsam em 12.121 pessoas reais. 11.753 telefones aparecem em duas ou mais
-- origens — a mesma pessoa e lead, aluno e contato de disparo em cadastros que nao se falam.
--
-- Nada e apagado. As tabelas de origem continuam donas dos seus dados; ganham so um
-- `pessoa_id` apontando para a identidade compartilhada.

-- ─── Normalizacao de telefone ────────────────────────────────────────────────
-- Formatos encontrados na base: 28.263 numeros com prefixo 55; 536 com 12 digitos (alguns
-- carregando o zero de operadora, ex: `5501198564301`); 332 sem o 55; 12 com 10 digitos
-- (celular antigo, sem o nono digito); e 8 com 18 digitos, que NAO sao telefone — sao id
-- de grupo do WhatsApp e precisam ser descartados.
create or replace function public.normalizar_telefone(p_valor text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  with d as (
    select regexp_replace(coalesce(p_valor, ''), '\D', '', 'g') as x
  ),
  sem_pais as (
    select case
      when length(x) > 14 then null              -- id de grupo do WhatsApp, nao telefone
      when x like '55%' and length(x) >= 12 then substr(x, 3)
      else x
    end as y from d
  ),
  sem_zero as (
    select case
      when y is null then null
      when y like '0%' then substr(y, 2)         -- zero de operadora colado no DDD
      else y
    end as w from sem_pais
  )
  select case
    when w is null or length(w) < 10 then null
    when length(w) = 11 then '55' || w
    -- 10 digitos comecando com 6-9 depois do DDD e celular antigo: ganha o nono digito.
    when length(w) = 10 and substr(w, 3, 1) between '6' and '9'
      then '55' || substr(w, 1, 2) || '9' || substr(w, 3)
    -- 10 digitos comecando com 2-5 e telefone fixo: continua com 8, sem inventar o 9.
    when length(w) = 10 then '55' || w
    else null
  end
  from sem_zero;
$fn$;

comment on function public.normalizar_telefone(text) is
  'Telefone brasileiro em formato canonico (55 + DDD + numero). Devolve NULL para o que nao e telefone — id de grupo do WhatsApp, numero curto demais.';

-- ─── Identidade ──────────────────────────────────────────────────────────────
create table public.pessoas (
  id           uuid primary key default gen_random_uuid(),
  nome         text,
  telefone     text,                       -- ja normalizado
  email        text,
  cpf          text,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  mesclada_em  uuid references public.pessoas(id)   -- preenchido quando vira duplicata de outra
);

comment on table public.pessoas is
  'Um ser humano, uma linha. As tabelas de origem (leads, alunos, ...) continuam existindo e apontam para ca via pessoa_id.';

-- Chaves pelas quais a pessoa pode ser reconhecida. Separado da tabela `pessoas` porque a
-- mesma pessoa pode chegar por telefones ou e-mails diferentes ao longo do tempo.
create table public.pessoa_identificadores (
  id        uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  tipo      text not null check (tipo in ('telefone', 'email', 'cpf')),
  valor     text not null,
  criado_em timestamptz not null default now(),
  unique (tipo, valor)
);

create index idx_pessoa_identificadores_pessoa on public.pessoa_identificadores(pessoa_id);

comment on table public.pessoa_identificadores is
  'Telefone/email/cpf -> pessoa. O UNIQUE (tipo, valor) e o que impede a mesma chave apontar para duas pessoas.';

-- O que essa pessoa e para o negocio, e por onde entrou.
create table public.pessoa_vinculos (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null references public.pessoas(id) on delete cascade,
  papel         text not null check (papel in ('lead','aluno','parceiro','convidado','investidor','colaborador')),
  origem_tabela text not null,
  origem_id     text not null,
  criado_em     timestamptz not null default now(),
  unique (origem_tabela, origem_id)
);

create index idx_pessoa_vinculos_pessoa on public.pessoa_vinculos(pessoa_id);
create index idx_pessoa_vinculos_papel  on public.pessoa_vinculos(papel);

comment on table public.pessoa_vinculos is
  'Uma linha por registro de origem. E o que permite responder "essa pessoa e lead E aluno" sem duplicar cadastro.';

-- ─── Resolucao idempotente ───────────────────────────────────────────────────
-- Chamar duas vezes com os mesmos dados devolve a mesma pessoa e nao cria nada novo.
-- E isso que permite usar em trigger e em backfill sem medo.
create or replace function public.resolver_pessoa(
  p_nome     text,
  p_telefone text,
  p_email    text default null,
  p_cpf      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tel    text := public.normalizar_telefone(p_telefone);
  v_email  text := lower(nullif(trim(p_email), ''));
  v_cpf    text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_pessoa uuid;
begin
  if v_tel is null and v_email is null and v_cpf is null then
    return null;   -- sem nenhuma chave nao da pra reconhecer ninguem
  end if;

  -- Ordem de confianca: CPF > telefone > email. E-mail e o mais fraco porque familia
  -- compartilha e-mail com frequencia nesse tipo de negocio.
  if v_cpf is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'cpf' and valor = v_cpf;
  end if;

  if v_pessoa is null and v_tel is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'telefone' and valor = v_tel;
  end if;

  if v_pessoa is null and v_email is not null then
    select pessoa_id into v_pessoa from public.pessoa_identificadores
     where tipo = 'email' and valor = v_email;
  end if;

  if v_pessoa is null then
    insert into public.pessoas (nome, telefone, email, cpf)
    values (nullif(trim(p_nome), ''), v_tel, v_email, v_cpf)
    returning id into v_pessoa;
  else
    -- Completa o que faltava, sem sobrescrever o que ja estava preenchido.
    update public.pessoas
       set nome     = coalesce(nome, nullif(trim(p_nome), '')),
           telefone = coalesce(telefone, v_tel),
           email    = coalesce(email, v_email),
           cpf      = coalesce(cpf, v_cpf),
           atualizado_em = now()
     where id = v_pessoa;
  end if;

  -- Registra as chaves. `on conflict do nothing` cobre o caso de a chave ja pertencer a
  -- outra pessoa — nesse caso a chave nao muda de dono aqui; isso e trabalho de mesclagem.
  if v_tel   is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'telefone', v_tel) on conflict (tipo, valor) do nothing;
  end if;
  if v_email is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'email', v_email) on conflict (tipo, valor) do nothing;
  end if;
  if v_cpf   is not null then
    insert into public.pessoa_identificadores (pessoa_id, tipo, valor)
    values (v_pessoa, 'cpf', v_cpf) on conflict (tipo, valor) do nothing;
  end if;

  return v_pessoa;
end;
$fn$;

comment on function public.resolver_pessoa(text, text, text, text) is
  'Acha ou cria a pessoa dessas chaves. Idempotente: pode ser chamada em trigger e em backfill sem duplicar.';

-- ─── Acesso ──────────────────────────────────────────────────────────────────
alter table public.pessoas                enable row level security;
alter table public.pessoa_identificadores enable row level security;
alter table public.pessoa_vinculos        enable row level security;

-- Quem ja podia ver alunos, pipeline ou time comercial pode ver a ficha da pessoa —
-- a pessoa nao mostra nada que essas telas ja nao mostrassem, so junta num lugar so.
select public.aplicar_camada_multi('pessoas',                array['alunos','pipeline','time_comercial']);
select public.aplicar_camada_multi('pessoa_identificadores', array['alunos','pipeline','time_comercial']);
select public.aplicar_camada_multi('pessoa_vinculos',        array['alunos','pipeline','time_comercial']);

grant select, insert, update, delete on public.pessoas                to authenticated;
grant select, insert, update, delete on public.pessoa_identificadores to authenticated;
grant select, insert, update, delete on public.pessoa_vinculos        to authenticated;
grant execute on function public.normalizar_telefone(text)                  to authenticated;
grant execute on function public.resolver_pessoa(text, text, text, text)    to authenticated;
