-- Rodizio atomico de vendedor por canal, usado pela pagina-ponte /obrigado
-- (lead-direto) pra intercalar automaticamente entre os vendedores do Time
-- Comercial. Uma linha por canal, contador avança de forma atomica via
-- UPDATE (lock de linha do Postgres evita corrida entre 2 leads simultaneos).
create table if not exists time_comercial_rodizio (
  canal text primary key,
  proximo integer not null default 0,
  atualizado_em timestamptz not null default now()
);

create or replace function time_comercial_proximo_indice(p_canal text, p_total int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idx int;
begin
  insert into time_comercial_rodizio (canal, proximo)
  values (p_canal, 0)
  on conflict (canal) do nothing;

  update time_comercial_rodizio
  set proximo = (proximo + 1) % greatest(p_total, 1),
      atualizado_em = now()
  where canal = p_canal
  returning proximo into v_idx;

  return v_idx;
end;
$$;
