-- Divã IDM: marketplace interno de terapia (pedido do Pedro 27-28/10/2026).
-- Fase 1: credenciamento manual de terapeutas + registro de sessão com
-- split R$50 terapeuta / R$30 IDM (pagamento/repasse manuais por enquanto,
-- campos já prontos pro split automático na Fase 2).

create table public.diva_terapeutas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  aluno_id uuid references public.alunos(id),
  especialidade text,
  bio text,
  foto_url text,
  whatsapp text,
  email text,
  status text not null default 'em_analise' check (status in ('em_analise','aprovado','pausado','reprovado')),
  created_at timestamptz not null default now()
);

create table public.diva_sessoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id),
  terapeuta_id uuid references public.diva_terapeutas(id),
  cliente_nome text not null,
  cliente_whatsapp text,
  tipo text not null default 'avulsa' check (tipo in ('avulsa','pacote')),
  valor_total numeric not null default 80,
  valor_terapeuta numeric not null default 50,
  valor_idm numeric not null default 30,
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente','pago')),
  status_repasse text not null default 'pendente' check (status_repasse in ('pendente','pago')),
  data_sessao date,
  observacoes text,
  created_at timestamptz not null default now()
);

alter table public.diva_terapeutas enable row level security;
alter table public.diva_sessoes enable row level security;

create policy "diva_terapeutas_ver" on public.diva_terapeutas
  for select to authenticated using ((select public.tem_permissao('diva','ver')));
create policy "diva_terapeutas_editar" on public.diva_terapeutas
  for all to authenticated
  using ((select public.tem_permissao('diva','editar')))
  with check ((select public.tem_permissao('diva','editar')));

create policy "diva_sessoes_ver" on public.diva_sessoes
  for select to authenticated using ((select public.tem_permissao('diva','ver')));
create policy "diva_sessoes_editar" on public.diva_sessoes
  for all to authenticated
  using ((select public.tem_permissao('diva','editar')))
  with check ((select public.tem_permissao('diva','editar')));

grant select, insert, update, delete on public.diva_terapeutas to authenticated;
grant select, insert, update, delete on public.diva_sessoes to authenticated;

-- Painel público (/diva): só nome/especialidade/bio/foto de terapeutas
-- aprovados -- nunca whatsapp/email. Policy própria pro anon + grant de
-- colunas restritas (uma primeira versão usou uma VIEW aqui, mas o linter
-- de segurança acusou SECURITY DEFINER view -- trocado por isto).
create policy "diva_terapeutas_publico_anon" on public.diva_terapeutas
  for select to anon
  using (status = 'aprovado');

revoke all on public.diva_terapeutas from anon;
grant select (id, nome, especialidade, bio, foto_url) on public.diva_terapeutas to anon;

-- Lead do Divã entra na mesma tabela `leads` do Time Comercial.
alter table public.leads drop constraint if exists leads_produto_check;
alter table public.leads add constraint leads_produto_check
  check (produto = any (array['direto','lancamento','npa','time_comercial','diva_idm']));

-- Recurso de permissão (mesmo padrão de workshops/webinario).
insert into public.app_recursos (chave, modulo, rotulo, ordem)
values ('diva', 'Eventos', 'Divã IDM', 55)
on conflict (chave) do nothing;

insert into public.role_permissoes (papel, recurso, acao)
values ('admin', 'diva', 'ver'), ('admin', 'diva', 'editar')
on conflict do nothing;
