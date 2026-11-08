-- Linktree premium das parceiras: temas, parceiras e links.
-- Aplicado em produção via Supabase MCP em 2026-07-14
-- (versões remotas: create_partners_linktree_schema, seed_partner_themes,
-- reuse_existing_helpers_for_partners). Este arquivo espelha o estado final.

create table public.partner_themes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_color text not null,
  secondary_color text not null,
  accent_color text not null,
  font_family text not null default 'Fraunces',
  background_preset text not null check (background_preset in ('aurora','waves','orbs','particles','geometric')),
  background_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  bio text,
  avatar_url text,
  theme_id uuid references public.partner_themes(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_slug_idx on public.partners (slug);
create index partners_status_idx on public.partners (status);

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  label text not null,
  url text not null,
  icon text,
  position integer not null default 0,
  type text not null default 'link' check (type in ('link','social','destaque')),
  is_active boolean not null default true,
  click_count bigint not null default 0,
  created_at timestamptz not null default now()
);

create index partner_links_partner_id_idx on public.partner_links (partner_id);
create index partner_links_position_idx on public.partner_links (partner_id, position);

-- Reaproveita o trigger genérico public.set_updated_at() já existente no projeto
create trigger partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

-- RLS
alter table public.partner_themes enable row level security;
alter table public.partners enable row level security;
alter table public.partner_links enable row level security;

-- Leitura pública dos temas (só estilo, sem dado sensível)
create policy "partner_themes_public_read" on public.partner_themes
  for select to anon, authenticated
  using (true);

-- Leitura pública: só parceiras publicadas
create policy "partners_public_read_published" on public.partners
  for select to anon
  using (status = 'published');

-- Leitura pública: só links ativos de parceiras publicadas
create policy "partner_links_public_read_active" on public.partner_links
  for select to anon
  using (
    is_active = true
    and exists (
      select 1 from public.partners p
      where p.id = partner_links.partner_id and p.status = 'published'
    )
  );

-- Admin (via public.is_admin(), já existente no projeto) enxerga e escreve tudo.
-- Defesa em profundidade: a tabela é alcançável por qualquer client autenticado,
-- e há milhares de contas de alunos, então não basta o gate de rota em /admin.
create policy "partner_themes_admin_all" on public.partner_themes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "partners_admin_all" on public.partners
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "partner_links_admin_all" on public.partner_links
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Presets de tema iniciais — autoconhecimento / psicanálise / PNL,
-- com o dourado da marca IDM como acento em comum entre eles.
insert into public.partner_themes (name, primary_color, secondary_color, accent_color, font_family, background_preset, background_config) values
('Aurora Interior', '#4C1D95', '#1E1B4B', '#FFB800', 'Fraunces', 'aurora', '{"speed": 0.6, "opacity": 0.55}'),
('Fluxo', '#0C4A6E', '#164E63', '#FFB800', 'Fraunces', 'waves', '{"speed": 0.5, "opacity": 0.5}'),
('Raízes', '#78350F', '#451A03', '#FFB800', 'Fraunces', 'orbs', '{"speed": 0.4, "opacity": 0.6}'),
('Constelação', '#1E1B4B', '#312E81', '#E9D5FF', 'Fraunces', 'particles', '{"speed": 0.5, "opacity": 0.5, "density": 60}'),
('Mente Clara', '#0F172A', '#1E293B', '#FFB800', 'Fraunces', 'geometric', '{"speed": 0.35, "opacity": 0.4}');
