-- Pedido do dono: follow-up automático pro vendedor, configurável por ele mesmo —
-- tempos, tipo de mídia (áudio/vídeo/imagem com legenda/só imagem) e quantidade de
-- passos, com filtro por produto e por lançamento/NPA específico, e um jeito de
-- excluir um lead pontual do automático.
--
-- Dispara por "lead sem resposta" — não por tempo parado na fase do funil.

create table public.followup_sequencias (
  id             uuid primary key default gen_random_uuid(),
  vendedor_id    uuid not null references auth.users(id) on delete cascade,
  nome           text not null default 'Follow-up',
  -- null = vale pra qualquer valor nessa dimensão. Prioridade de match no envio:
  -- lançamento/NPA específico > produto > geral (todos null).
  produto        text,
  lancamento_id  uuid references public.lancamentos(id) on delete set null,
  npa_evento_id  uuid references public.npa_eventos(id) on delete set null,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.followup_sequencias is
  'Sequência de follow-up automático de um vendedor — filtro de público (produto/lançamento) + os passos em followup_passos.';

create table public.followup_passos (
  id               uuid primary key default gen_random_uuid(),
  sequencia_id     uuid not null references public.followup_sequencias(id) on delete cascade,
  ordem            smallint not null,
  -- Horas sem resposta do lead (desde a última mensagem enviada a ele) pra este
  -- passo disparar.
  intervalo_horas  smallint not null check (intervalo_horas > 0),
  tipo_midia       text not null check (tipo_midia in ('texto', 'imagem', 'imagem_legenda', 'audio', 'video')),
  texto            text,
  media_url        text,
  created_at       timestamptz not null default now(),
  unique (sequencia_id, ordem)
);

comment on table public.followup_passos is
  'Um passo = uma mensagem da sequência de follow-up, com seu próprio intervalo e tipo de mídia.';

-- Progresso e opt-out ficam no próprio lead — mais simples que uma tabela de estado
-- à parte, e cada lead segue no máximo uma sequência de cada vez.
alter table public.leads
  add column if not exists followup_pausado       boolean not null default false,
  add column if not exists followup_sequencia_id   uuid references public.followup_sequencias(id) on delete set null,
  add column if not exists followup_passo_atual    smallint not null default 0,
  add column if not exists followup_ultimo_envio   timestamptz;

comment on column public.leads.followup_pausado is
  'Interruptor manual — true = esse lead não recebe follow-up automático, mesmo que a sequência do vendedor esteja ativa.';

alter table public.followup_sequencias enable row level security;
alter table public.followup_passos     enable row level security;

revoke all on public.followup_sequencias from anon, public;
revoke all on public.followup_passos     from anon, public;

create policy "Admin can manage followup_sequencias"
  on public.followup_sequencias for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

create policy "Vendedor manages own followup_sequencias"
  on public.followup_sequencias for all
  using (vendedor_id = (select auth.uid()))
  with check (vendedor_id = (select auth.uid()));

create policy "Admin can manage followup_passos"
  on public.followup_passos for all
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

create policy "Vendedor manages own followup_passos"
  on public.followup_passos for all
  using (sequencia_id in (select id from public.followup_sequencias where vendedor_id = (select auth.uid())))
  with check (sequencia_id in (select id from public.followup_sequencias where vendedor_id = (select auth.uid())));

grant select, insert, update, delete on public.followup_sequencias to authenticated;
grant select, insert, update, delete on public.followup_passos     to authenticated;
