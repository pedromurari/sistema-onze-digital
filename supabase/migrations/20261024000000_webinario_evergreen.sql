-- Webinário evergreen — novo canal de aquisição (porta o sistema de E:\webnar-idm
-- pra dentro do CRM). Migration ADITIVA: não altera nenhuma tabela existente, só
-- adiciona webinario_id em kanban_colunas (mesmo padrão de npa_evento_id /
-- aula_secreta_evento_id) e cria as 4 tabelas novas abaixo.

-- ── 1. webinarios ──────────────────────────────────────────────────────────
create table public.webinarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  produto_id uuid references public.produtos(id),
  video_url text, -- Cloudflare R2 (sem custo de saída), arquivo direto <video>
  video_duracao_segundos integer,
  oferta_offset_segundos integer, -- segundo em que o CTA/pitch aparece
  grupo_whatsapp_url text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.webinarios is 'Webinários evergreen (canal de aquisição) — config de vídeo, oferta e grupo por webinário.';

alter table public.webinarios enable row level security;

create policy webinarios_ver on public.webinarios for select
  using (select tem_permissao('webinario', 'ver'));
create policy webinarios_inserir on public.webinarios for insert
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinarios_update on public.webinarios for update
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')))
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinarios_delete on public.webinarios for delete
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));

grant select, insert, update, delete, truncate, references, trigger on public.webinarios to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.webinarios to service_role;

-- ── 2. webinario_sessoes ───────────────────────────────────────────────────
create table public.webinario_sessoes (
  id uuid primary key default gen_random_uuid(),
  webinario_id uuid not null references public.webinarios(id) on delete cascade,
  inicio_em timestamptz not null,
  status text not null default 'agendada' check (status in ('agendada', 'ao_vivo', 'encerrada')),
  created_at timestamptz not null default now()
);
comment on table public.webinario_sessoes is 'Grade de sessões do webinário evergreen (30 em 30 min, 06h-23h BRT), geradas por cron.';
create index webinario_sessoes_webinario_id_idx on public.webinario_sessoes(webinario_id);
create index webinario_sessoes_inicio_em_idx on public.webinario_sessoes(inicio_em);

alter table public.webinario_sessoes enable row level security;

create policy webinario_sessoes_ver on public.webinario_sessoes for select
  using (select tem_permissao('webinario', 'ver'));
create policy webinario_sessoes_inserir on public.webinario_sessoes for insert
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinario_sessoes_update on public.webinario_sessoes for update
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')))
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinario_sessoes_delete on public.webinario_sessoes for delete
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));

grant select, insert, update, delete, truncate, references, trigger on public.webinario_sessoes to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.webinario_sessoes to service_role;

-- ── 3. webinario_mensagens_chat ────────────────────────────────────────────
create table public.webinario_mensagens_chat (
  id uuid primary key default gen_random_uuid(),
  webinario_id uuid not null references public.webinarios(id) on delete cascade,
  segundo integer not null, -- momento do vídeo em que a mensagem "aparece" no chat fake
  autor_nome text not null,
  texto text not null,
  created_at timestamptz not null default now()
);
comment on table public.webinario_mensagens_chat is 'Script do chat fake roteirizado por webinário, disparado conforme o segundo do vídeo.';
create index webinario_mensagens_chat_webinario_id_idx on public.webinario_mensagens_chat(webinario_id, segundo);

alter table public.webinario_mensagens_chat enable row level security;

create policy webinario_mensagens_chat_ver on public.webinario_mensagens_chat for select
  using (select tem_permissao('webinario', 'ver'));
create policy webinario_mensagens_chat_inserir on public.webinario_mensagens_chat for insert
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinario_mensagens_chat_update on public.webinario_mensagens_chat for update
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')))
  with check ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));
create policy webinario_mensagens_chat_delete on public.webinario_mensagens_chat for delete
  using ((select tem_permissao('webinario', 'ver')) and (select tem_permissao('webinario', 'editar')));

grant select, insert, update, delete, truncate, references, trigger on public.webinario_mensagens_chat to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.webinario_mensagens_chat to service_role;
-- anon lê o chat script pra renderizar a sala pública (sem autenticação)
grant select on public.webinario_mensagens_chat to anon;
create policy webinario_mensagens_chat_anon_ver on public.webinario_mensagens_chat for select to anon
  using (true);

-- ── 4. webinario_tracking (watch_stage, só avança) ─────────────────────────
create table public.webinario_tracking (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sessao_id uuid not null references public.webinario_sessoes(id) on delete cascade,
  watch_stage text not null default 'registered'
    check (watch_stage in ('registered','entered','watched_25','watched_50','watched_75','completed','cta_seen','offer_clicked')),
  current_second integer,
  total_seconds integer,
  device text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  entered_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.webinario_tracking is 'Funil de assistência por lead/sessão (watch_stage só avança, nunca volta) — alimenta o handoff pro Kanban comercial.';
create index webinario_tracking_lead_id_idx on public.webinario_tracking(lead_id);
create index webinario_tracking_sessao_id_idx on public.webinario_tracking(sessao_id);

alter table public.webinario_tracking enable row level security;

create policy webinario_tracking_ver on public.webinario_tracking for select
  using (select tem_permissao('webinario', 'ver'));
create policy webinario_tracking_service_role_tudo on public.webinario_tracking for all
  to service_role using (true) with check (true);

grant select on public.webinario_tracking to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.webinario_tracking to service_role;
-- Sem INSERT/UPDATE direto pra anon/authenticated: tracking só é escrito pelas
-- edge functions (service_role), nunca direto do navegador do lead.

-- ── 5. kanban_colunas: novo tipo de quadro (mesmo padrão de npa_evento_id) ──
alter table public.kanban_colunas add column webinario_id uuid references public.webinarios(id);

-- ── 6. app_recursos: nova tela no menu/matriz de permissão ─────────────────
insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('webinario', 'Eventos', 'Webinário', 50);
