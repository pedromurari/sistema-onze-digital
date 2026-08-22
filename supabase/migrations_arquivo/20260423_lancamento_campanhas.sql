create table if not exists public.lancamento_campanhas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete cascade,
  nome text not null default 'Campanha 1',
  meta_campaign_id text,
  meta_ad_account_id text,
  meta_access_token text,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.lancamento_campanhas enable row level security;

drop policy if exists "Authenticated users can manage campanhas" on public.lancamento_campanhas;
create policy "Authenticated users can manage campanhas"
on public.lancamento_campanhas for all
to authenticated
using (true)
with check (true);
