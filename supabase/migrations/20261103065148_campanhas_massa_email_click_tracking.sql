alter table public.campanhas_massa add column if not exists email_link_cta text;
alter table public.campanhas_massa_destinatarios add column if not exists clicado_email_em timestamptz;
create index if not exists campanhas_massa_destinatarios_clicado_idx on public.campanhas_massa_destinatarios (campanha_id) where clicado_email_em is not null;
