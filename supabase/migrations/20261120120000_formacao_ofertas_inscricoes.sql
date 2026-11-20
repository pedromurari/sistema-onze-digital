-- Formações vendidas por preço único (Pix à vista ou cartão parcelado), com
-- ficha pública própria e cobrança na conta Mercado Pago institucional do IDM
-- (secret MP_ACCESS_TOKEN) -- NÃO é o fluxo de split de `parceiros` (aquele é
-- pra terceiro de fora, tipo terapeuta do Divã). A divisão entre os sócios
-- acontece onde já acontece hoje: Financeiro → Sócios/DRE.
--
-- Primeiro produto: "Despertar Sistêmico" (Formação em Constelação Familiar
-- Sistêmica), pedido do Pedro em 20/11/2026 -- produto criado pelo Rodrygo,
-- vendido em R$497 à vista no Pix ou até 12x de R$50,88 no cartão.
--
-- Desenhado como tabela (e não hardcode) porque o Pedro quer uma página de
-- venda padrão replicável pra cada formação -- a próxima entra só com um
-- INSERT aqui + uma pasta nova em apps/membros/src/app/programas/.

create table if not exists public.formacao_ofertas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null,
  max_parcelas integer not null default 12,
  -- Como o lead nasce etiquetado no Kanban do Time Comercial:
  interesse_produto text not null,
  vendedor_padrao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.formacao_inscricoes (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.formacao_ofertas(id),
  lead_id uuid references public.leads(id),
  nome text not null,
  email text not null,
  whatsapp text not null,
  cpf text,
  valor numeric(10,2) not null,
  metodo text not null check (metodo in ('pix','cartao')),
  parcelas integer,
  mp_payment_id text,
  status text not null default 'pendente'
    check (status in ('pendente','aprovado','recusado','cancelado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists formacao_inscricoes_oferta_idx on public.formacao_inscricoes(oferta_id);
create index if not exists formacao_inscricoes_mp_idx on public.formacao_inscricoes(mp_payment_id);
create index if not exists formacao_inscricoes_whatsapp_idx on public.formacao_inscricoes(whatsapp);

alter table public.formacao_ofertas enable row level security;
alter table public.formacao_inscricoes enable row level security;

-- RLS sozinha não basta neste projeto: o papel `authenticated` também precisa
-- do GRANT (convenção registrada no AGENTS.md da raiz).
grant select on public.formacao_ofertas to authenticated;
grant select on public.formacao_inscricoes to authenticated;

drop policy if exists formacao_ofertas_staff_ver on public.formacao_ofertas;
create policy formacao_ofertas_staff_ver on public.formacao_ofertas
  for select to authenticated
  using (public.is_admin() or public.tem_permissao('time_comercial','ver'));

drop policy if exists formacao_inscricoes_staff_ver on public.formacao_inscricoes;
create policy formacao_inscricoes_staff_ver on public.formacao_inscricoes
  for select to authenticated
  using (public.is_admin() or public.tem_permissao('time_comercial','ver'));

-- A ficha pública e o webhook escrevem via edge function (service_role), que
-- ignora RLS -- por isso não existe policy de insert/update pra anon aqui.

insert into public.formacao_ofertas (slug, nome, descricao, preco, max_parcelas, interesse_produto, vendedor_padrao)
values (
  'constelacao-familiar',
  'Despertar Sistêmico',
  'Formação em Constelação Familiar Sistêmica — 3 meses, 8 módulos, 12 aulas.',
  497.00,
  12,
  'Despertar Sistêmico (Constelação Familiar)',
  'Helen Magna'
)
on conflict (slug) do nothing;
