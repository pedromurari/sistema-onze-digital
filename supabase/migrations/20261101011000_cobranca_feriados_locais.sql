-- Feriados estaduais/municipais adicionais podem ser registrados aqui.
-- Os nacionais e os da sede (São Paulo/SP) são calculados pelo motor.
create table if not exists public.cobranca_feriados (
  data date primary key,
  nome text not null,
  created_at timestamptz not null default now()
);

alter table public.cobranca_feriados enable row level security;

create policy cobranca_feriados_ver on public.cobranca_feriados
  for select to authenticated using (public.tem_permissao('cobranca', 'ver'));
create policy cobranca_feriados_inserir on public.cobranca_feriados
  for insert to authenticated with check (public.tem_permissao('cobranca', 'editar'));
create policy cobranca_feriados_editar on public.cobranca_feriados
  for update to authenticated using (public.tem_permissao('cobranca', 'editar'))
  with check (public.tem_permissao('cobranca', 'editar'));
create policy cobranca_feriados_excluir on public.cobranca_feriados
  for delete to authenticated using (public.tem_permissao('cobranca', 'editar'));

grant select, insert, update, delete on public.cobranca_feriados to authenticated;
grant all on public.cobranca_feriados to service_role;
