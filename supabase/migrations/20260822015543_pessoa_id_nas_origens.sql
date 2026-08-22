-- Sprint 3b — Coluna de ligacao nas tabelas de origem.
-- Nullable de proposito: o backfill preenche em seguida, e linha sem telefone nem email
-- aproveitavel (27 no total) fica sem pessoa mesmo. Nada quebra por causa disso.

alter table public.leads                add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.lancamento_leads     add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.alunos               add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.npa_evento_leads     add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.disparo_leads        add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.seu_numerologo_leads add column if not exists pessoa_id uuid references public.pessoas(id);
alter table public.franquia_leads       add column if not exists pessoa_id uuid references public.pessoas(id);

create index if not exists idx_leads_pessoa                on public.leads(pessoa_id);
create index if not exists idx_lancamento_leads_pessoa     on public.lancamento_leads(pessoa_id);
create index if not exists idx_alunos_pessoa               on public.alunos(pessoa_id);
create index if not exists idx_npa_evento_leads_pessoa     on public.npa_evento_leads(pessoa_id);
create index if not exists idx_disparo_leads_pessoa        on public.disparo_leads(pessoa_id);
create index if not exists idx_seu_numerologo_leads_pessoa on public.seu_numerologo_leads(pessoa_id);
create index if not exists idx_franquia_leads_pessoa       on public.franquia_leads(pessoa_id);
