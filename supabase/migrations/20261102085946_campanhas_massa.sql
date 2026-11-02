
create table public.campanhas_massa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status text not null default 'rascunho' check (status in ('rascunho','pronta','enviando','concluida','pausada')),
  canal text not null default 'whatsapp' check (canal in ('whatsapp','email','ambos')),
  fonte text not null check (fonte in ('lancamento_turma','leads_produto','base_completa')),
  fonte_filtro jsonb not null default '{}'::jsonb,
  texto_whatsapp text,
  link_cta text,
  email_assunto text,
  email_corpo text,
  total_destinatarios integer not null default 0,
  total_enviados_email integer not null default 0,
  total_erro_email integer not null default 0,
  disparo_campanha_id uuid references public.disparo_campanhas(id),
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create table public.campanhas_massa_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas_massa(id) on delete cascade,
  pessoa_id uuid references public.pessoas(id),
  nome text,
  telefone text,
  email text,
  disparo_lead_id uuid references public.disparo_leads(id),
  status_email text not null default 'pendente' check (status_email in ('pendente','enviado','erro','sem_email','nao_aplicavel')),
  enviado_email_em timestamptz,
  erro_msg text,
  created_at timestamptz not null default now()
);

create index campanhas_massa_destinatarios_campanha_idx on public.campanhas_massa_destinatarios (campanha_id);
create index campanhas_massa_destinatarios_email_pendente_idx on public.campanhas_massa_destinatarios (status_email) where status_email = 'pendente';

alter table public.campanhas_massa enable row level security;
alter table public.campanhas_massa_destinatarios enable row level security;

grant select, insert, update, delete on public.campanhas_massa to authenticated;
grant select, insert, update, delete on public.campanhas_massa_destinatarios to authenticated;

create policy campanhas_massa_ver on public.campanhas_massa
  for select to authenticated using (tem_permissao('disparos_monitor', 'ver'));
create policy campanhas_massa_editar on public.campanhas_massa
  for all to authenticated
  using (tem_permissao('disparos_monitor', 'ver') and tem_permissao('disparos_monitor', 'editar'))
  with check (tem_permissao('disparos_monitor', 'ver') and tem_permissao('disparos_monitor', 'editar'));

create policy campanhas_massa_destinatarios_ver on public.campanhas_massa_destinatarios
  for select to authenticated using (tem_permissao('disparos_monitor', 'ver'));
create policy campanhas_massa_destinatarios_editar on public.campanhas_massa_destinatarios
  for all to authenticated
  using (tem_permissao('disparos_monitor', 'ver') and tem_permissao('disparos_monitor', 'editar'))
  with check (tem_permissao('disparos_monitor', 'ver') and tem_permissao('disparos_monitor', 'editar'));
