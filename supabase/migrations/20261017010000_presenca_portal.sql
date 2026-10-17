-- Autoassinatura pelo link da aula; reutiliza aulas e presencas existentes.
begin;

alter table public.presencas
  add column confirmado_via_link boolean not null default false;

create function public.proteger_presenca_portal() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      if new.confirmado_via_link then raise exception 'ASSINATURA_RESTRITA'; end if;
    elsif tg_op = 'UPDATE' then
      if old.confirmado_via_link or new.confirmado_via_link then raise exception 'ASSINATURA_PROTEGIDA'; end if;
    elsif tg_op = 'DELETE' then
      if old.confirmado_via_link then raise exception 'ASSINATURA_PROTEGIDA'; end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger proteger_presenca_portal before insert or update or delete on public.presencas
  for each row execute function public.proteger_presenca_portal();

create function public.registrar_presenca_portal(
  p_aula_id uuid, p_tipo text, p_pessoa_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_aula public.aulas%rowtype;
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_aula from public.aulas where id = p_aula_id for update;
  if not found or v_aula.status not in ('agendada', 'realizada') then
    raise exception 'AULA_INDISPONIVEL';
  end if;
  if v_hoje < v_aula.data or v_hoje > v_aula.data + 1 then
    raise exception 'FORA_DA_JANELA';
  end if;

  if p_tipo = 'professor' then
    if v_aula.profissional_id is null or p_pessoa_id is distinct from v_aula.profissional_id then
      raise exception 'PROFESSOR_INVALIDO';
    end if;
    insert into public.presencas
      (aula_id, tipo, profissional_id, presente, assinado_em, confirmado_via_link)
    values (p_aula_id, 'professor', p_pessoa_id, true, now(), true)
    on conflict (aula_id, profissional_id) where tipo = 'professor'
    do update set presente = true,
      assinado_em = case when presencas.confirmado_via_link then presencas.assinado_em else now() end,
      confirmado_via_link = true
    returning id into v_id;
    update public.aulas set status = 'realizada' where id = p_aula_id and status = 'agendada';
  elsif p_tipo = 'aluno' then
    if not exists (select 1 from public.alunos
      where id = p_pessoa_id and turma_id = v_aula.turma_id and status = 'ativo') then
      raise exception 'ALUNO_INVALIDO';
    end if;
    insert into public.presencas
      (aula_id, tipo, aluno_id, presente, assinado_em, confirmado_via_link)
    values (p_aula_id, 'aluno', p_pessoa_id, true, now(), true)
    on conflict (aula_id, aluno_id) where tipo = 'aluno'
    do update set presente = true,
      assinado_em = case when presencas.confirmado_via_link then presencas.assinado_em else now() end,
      confirmado_via_link = true
    returning id into v_id;
  else
    raise exception 'TIPO_INVALIDO';
  end if;
  return v_id;
end $$;

revoke all on function public.registrar_presenca_portal(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.registrar_presenca_portal(uuid, text, uuid) to service_role;

commit;
