-- Sprint 1.1h — Instrumenta o INSERT anonimo antes de fecha-lo.
-- O dono confirmou formularios fora deste repo usando a chave anonima; o log de 24h
-- so mostrou trafego real em `sheet_leads_44` — janela curta demais pra concluir.
-- Fechar as cegas perderia lead sem ninguem perceber. Registra por alguns dias e
-- decide com evidencia. O gatilho nunca derruba o INSERT.

create table if not exists public.anon_insert_watch (
  id          bigserial primary key,
  tabela      text        not null,
  ocorrido_em timestamptz not null default now()
);

alter table public.anon_insert_watch enable row level security;

create policy anon_insert_watch_admin_le on public.anon_insert_watch
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

comment on table public.anon_insert_watch is
  'Temporaria (sprint 1.1h): registra INSERT feito com a chave anonima, pra descobrir quais fluxos publicos existem de verdade antes de fechar o resto. Remover quando a decisao for tomada.';

create or replace function public.registrar_insert_anonimo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    begin
      insert into public.anon_insert_watch (tabela) values (tg_table_name);
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

create trigger vigia_insert_anonimo_alunos
  after insert on public.alunos
  for each row execute function public.registrar_insert_anonimo();

create trigger vigia_insert_anonimo_leads
  after insert on public.leads
  for each row execute function public.registrar_insert_anonimo();
