-- Login real (WhatsApp + PIN de 6 digitos) pro painel publico do terapeuta
-- (/diva/terapeuta/:id) -- antes o link em si (UUID) era o unico "acesso",
-- o Pedro pediu login de verdade pra nao ficar com dado de cliente atras
-- so de um link. PIN com tentativas limitadas (5) + bloqueio de 15min,
-- mesmo espirito de protecao contra forca bruta que o resto do projeto usa
-- (ex: aluno-atualizar-dados, presenca-publica, com token/HMAC).

alter table public.diva_terapeutas
  add column if not exists pin_hash text,
  add column if not exists pin_tentativas int not null default 0,
  add column if not exists pin_bloqueado_ate timestamptz;

-- Gerado pelo admin (FichaTerapeutaDialog) -- exige tem_permissao('diva','editar').
create or replace function public.diva_terapeuta_pin_gerar(p_terapeuta_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions -- crypt()/gen_salt() (pgcrypto) vivem em extensions, nao public
as $$
declare
  v_pin text;
begin
  if not tem_permissao('diva', 'editar') then
    raise exception 'sem permissao';
  end if;

  v_pin := lpad(floor(random() * 1000000)::int::text, 6, '0');

  update public.diva_terapeutas
  set pin_hash = crypt(v_pin, gen_salt('bf')),
      pin_tentativas = 0,
      pin_bloqueado_ate = null
  where id = p_terapeuta_id;

  if not found then
    raise exception 'terapeuta nao encontrado';
  end if;

  return v_pin;
end;
$$;

revoke execute on function public.diva_terapeuta_pin_gerar(uuid) from public;
grant execute on function public.diva_terapeuta_pin_gerar(uuid) to authenticated;

-- Chamada so pela edge function diva-terapeuta-login (service_role) -- nunca
-- exposta a anon/authenticated direto via PostgREST, pra nao burlar o
-- bloqueio por tentativas.
create or replace function public.diva_terapeuta_pin_autenticar(p_whatsapp text, p_pin text)
returns table(terapeuta_id uuid, nome text, sucesso boolean, motivo text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_whats_digits text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_row record;
begin
  if length(v_whats_digits) < 8 then
    return query select null::uuid, null::text, false, 'whatsapp_invalido';
    return;
  end if;

  select t.id, t.nome, t.pin_hash, t.pin_tentativas, t.pin_bloqueado_ate
  into v_row
  from public.diva_terapeutas t
  where t.status = 'aprovado'
    and regexp_replace(coalesce(t.whatsapp, ''), '\D', '', 'g') like '%' || right(v_whats_digits, 8)
  limit 1;

  if v_row.id is null then
    return query select null::uuid, null::text, false, 'nao_encontrado';
    return;
  end if;

  if v_row.pin_bloqueado_ate is not null and v_row.pin_bloqueado_ate > now() then
    return query select v_row.id, v_row.nome, false, 'bloqueado';
    return;
  end if;

  if v_row.pin_hash is null then
    return query select v_row.id, v_row.nome, false, 'sem_pin';
    return;
  end if;

  if crypt(p_pin, v_row.pin_hash) = v_row.pin_hash then
    update public.diva_terapeutas set pin_tentativas = 0, pin_bloqueado_ate = null where id = v_row.id;
    return query select v_row.id, v_row.nome, true, 'ok';
  else
    update public.diva_terapeutas
      set pin_tentativas = v_row.pin_tentativas + 1,
          pin_bloqueado_ate = case when v_row.pin_tentativas + 1 >= 5 then now() + interval '15 minutes' else null end
      where id = v_row.id;
    return query select v_row.id, v_row.nome, false, 'pin_errado';
  end if;
end;
$$;

revoke execute on function public.diva_terapeuta_pin_autenticar(text, text) from public;
grant execute on function public.diva_terapeuta_pin_autenticar(text, text) to service_role;
