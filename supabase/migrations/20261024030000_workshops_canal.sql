-- Canal Workshop: edições gratuitas/pagas e inscrições. Somente adições.
begin;

insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('workshops', 'Eventos', 'Workshop', 51)
on conflict (chave) do nothing;
insert into public.role_permissoes (papel, recurso, acao)
values ('admin', 'workshops', 'ver'), ('admin', 'workshops', 'editar')
on conflict do nothing;

create table public.workshop_edicoes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titulo text not null,
  headline text not null,
  subheadline text not null,
  descricao text,
  bonus_descricao text,
  modalidade text not null check (modalidade in ('gratuito', 'pago')),
  valor_centavos integer check (valor_centavos is null or valor_centavos > 0),
  inicio_em timestamptz,
  produto_id uuid references public.produtos(id),
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (modalidade = 'gratuito' or valor_centavos is not null or ativo = false)
);
create index workshop_edicoes_ativo_idx on public.workshop_edicoes(ativo);
alter table public.workshop_edicoes enable row level security;
create policy workshop_edicoes_ver on public.workshop_edicoes for select to authenticated
  using ((select public.tem_permissao('workshops','ver')));
create policy workshop_edicoes_editar on public.workshop_edicoes for all to authenticated
  using ((select public.tem_permissao('workshops','editar')))
  with check ((select public.tem_permissao('workshops','editar')));
create policy workshop_edicoes_anon on public.workshop_edicoes for select to anon
  using (ativo = true);
grant select, insert, update, delete on public.workshop_edicoes to authenticated;
grant select (id, slug, titulo, headline, subheadline, descricao,
  bonus_descricao, modalidade, valor_centavos, inicio_em, ativo)
  on public.workshop_edicoes to anon;
grant all on public.workshop_edicoes to service_role;

create table public.workshop_inscricoes (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshop_edicoes(id),
  lead_id uuid not null references public.leads(id),
  whatsapp_normalizado text not null,
  status text not null default 'inscrito'
    check (status in ('inscrito','pendente_pagamento','pago','interessado','cancelado')),
  pagamento_id text,
  pagamento_url text,
  created_at timestamptz not null default now(),
  pago_em timestamptz,
  unique (workshop_id, whatsapp_normalizado)
);
create index workshop_inscricoes_workshop_status_idx
  on public.workshop_inscricoes(workshop_id, status);
alter table public.workshop_inscricoes enable row level security;
create policy workshop_inscricoes_ver on public.workshop_inscricoes for select to authenticated
  using ((select public.tem_permissao('workshops','ver')));
create policy workshop_inscricoes_editar on public.workshop_inscricoes for all to authenticated
  using ((select public.tem_permissao('workshops','editar')))
  with check ((select public.tem_permissao('workshops','editar')));
grant select, insert, update, delete on public.workshop_inscricoes to authenticated;
grant all on public.workshop_inscricoes to service_role;

insert into public.workshop_edicoes
  (slug, titulo, headline, subheadline, descricao, bonus_descricao,
   modalidade, valor_centavos, produto_id, ativo)
values
  ('primeiros-passos-psicanalise', 'Da curiosidade à escuta',
   'Um primeiro passo sério para estudar psicanálise',
   'Workshop gratuito: descubra como observar, escutar e estudar sem cair em diagnósticos rápidos.',
   'Encontro educativo introdutório. Ao final, conheça a Formação em Psicanálise Integrativa do IDM.',
   'Checklist: 10 perguntas para escolher uma formação com consciência.',
   'gratuito', null, '5b249002-ce8c-4836-8d4d-6f6f3b2d376c', true),
  ('escuta-na-pratica', 'A escuta na prática',
   'Aprenda a trocar respostas prontas por perguntas melhores',
   'Workshop com exercícios guiados de escuta, ética e limites — uma introdução à formação completa.',
   'Edição paga em preparação. O valor e a data serão definidos antes de abrir inscrições.',
   'Caderno de exercícios de escuta e roteiro de estudo.',
   'pago', null, '5b249002-ce8c-4836-8d4d-6f6f3b2d376c', false)
on conflict (slug) do nothing;

commit;
