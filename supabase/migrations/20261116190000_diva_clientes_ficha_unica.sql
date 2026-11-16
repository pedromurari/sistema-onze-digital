-- Ficha unica de cliente do Diva: reconhece recompra do mesmo cliente
-- (por whatsapp normalizado, com fallback por nome) e agrupa o historico
-- dele numa unica "ficha" em vez de varias linhas soltas em diva_sessoes.

create table public.diva_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text,
  whatsapp_normalizado text generated always as (
    nullif(right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 11), '')
  ) stored,
  created_at timestamptz not null default now()
);

create index diva_clientes_whatsapp_normalizado_idx
  on public.diva_clientes (whatsapp_normalizado)
  where whatsapp_normalizado is not null;

alter table public.diva_sessoes
  add column cliente_id uuid references public.diva_clientes(id);

-- Backfill: agrupa as vendas existentes por whatsapp normalizado
-- (ou por nome, quando nao tem whatsapp valido), uma ficha por grupo.
with chave as (
  select
    id,
    cliente_nome,
    cliente_whatsapp,
    created_at,
    coalesce(
      nullif(right(regexp_replace(cliente_whatsapp, '\D', '', 'g'), 11), ''),
      lower(trim(cliente_nome))
    ) as chave_cliente
  from public.diva_sessoes
),
primeira_ocorrencia as (
  select distinct on (chave_cliente)
    chave_cliente, cliente_nome, cliente_whatsapp
  from chave
  order by chave_cliente, created_at asc
),
inseridos as (
  insert into public.diva_clientes (nome, whatsapp)
  select cliente_nome, cliente_whatsapp from primeira_ocorrencia
  returning id, nome, whatsapp
)
update public.diva_sessoes ds
set cliente_id = dc.id
from chave c
join inseridos dc
  on coalesce(nullif(right(regexp_replace(dc.whatsapp, '\D', '', 'g'), 11), ''), lower(trim(dc.nome)))
     = c.chave_cliente
where ds.id = c.id;

alter table public.diva_clientes enable row level security;

create policy diva_clientes_ver on public.diva_clientes
  for select using ( (select tem_permissao('diva', 'ver')) );

create policy diva_clientes_editar on public.diva_clientes
  for all using ( (select tem_permissao('diva', 'editar')) )
  with check ( (select tem_permissao('diva', 'editar')) );

grant select, insert, update, delete on public.diva_clientes to authenticated;

-- Acha a ficha do cliente (por whatsapp normalizado, com fallback por nome)
-- ou cria uma nova -- usada tanto pelo registro manual (SessoesTab) quanto
-- pela venda automatica (mp-webhook), pra nunca duplicar ficha de quem ja comprou.
create or replace function public.diva_cliente_vincular(p_nome text, p_whatsapp text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_whatsapp_norm text := nullif(right(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), 11), '');
  v_nome_norm text := lower(trim(coalesce(p_nome, '')));
  v_cliente_id uuid;
begin
  if v_whatsapp_norm is not null then
    select id into v_cliente_id
    from public.diva_clientes
    where whatsapp_normalizado = v_whatsapp_norm
    limit 1;
  end if;

  if v_cliente_id is null and v_nome_norm <> '' then
    select id into v_cliente_id
    from public.diva_clientes
    where lower(trim(nome)) = v_nome_norm
    limit 1;
  end if;

  if v_cliente_id is not null then
    update public.diva_clientes
    set whatsapp = coalesce(nullif(whatsapp, ''), p_whatsapp)
    where id = v_cliente_id;
    return v_cliente_id;
  end if;

  insert into public.diva_clientes (nome, whatsapp)
  values (p_nome, p_whatsapp)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.diva_cliente_vincular(text, text) to authenticated, service_role;
