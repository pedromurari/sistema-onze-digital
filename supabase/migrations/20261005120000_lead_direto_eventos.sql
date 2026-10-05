-- Funil do site lead-direto (formacao.idmpsi.com.br): visita -> modal -> cadastro -> video -> clique no WhatsApp.
-- Gravado pela edge function lead-direto-evento (service role); sem policy = anon/authenticated nao acessam.
create table if not exists public.lead_direto_eventos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  evento text not null,
  pagina text,
  host text,
  visitor_id text,
  lead_id uuid,
  event_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  dispositivo text,
  detalhe text,
  is_bot boolean not null default false
);

create unique index if not exists lead_direto_eventos_event_id_key
  on public.lead_direto_eventos (event_id);
create index if not exists lead_direto_eventos_evento_criado_idx
  on public.lead_direto_eventos (evento, criado_em desc);
create index if not exists lead_direto_eventos_criado_idx
  on public.lead_direto_eventos (criado_em desc);

alter table public.lead_direto_eventos enable row level security;

create or replace view public.vw_lead_direto_funil_diario
with (security_invoker = true) as
select
  (criado_em at time zone 'America/Sao_Paulo')::date as dia,
  coalesce(pagina, '(desconhecida)') as pagina,
  count(distinct visitor_id) filter (where evento = 'pageview') as visitantes,
  count(*) filter (where evento = 'pageview') as pageviews,
  count(distinct visitor_id) filter (where evento = 'modal_aberto') as abriram_modal,
  count(distinct visitor_id) filter (where evento = 'cadastro') as cadastros,
  count(distinct visitor_id) filter (where evento = 'video_play') as deram_play,
  count(distinct visitor_id) filter (where evento = 'clique_whatsapp') as clicaram_whatsapp
from public.lead_direto_eventos
where not is_bot and host = 'formacao.idmpsi.com.br'
group by 1, 2;
