-- Função central de verificação de acesso, usada pelo endpoint /api/access/check
-- e chamada pelas ferramentas externas (Mapa 7 Esferas, Perfil Numerológico).
-- NPA: acesso liberado enquanto a matrícula estiver ativa (sem limite de uso).
-- NPS: acesso liberado enquanto a matrícula estiver ativa E o limite mensal
-- (5 mapas) não tiver sido atingido — contando em public.mapa_7_esferas_maps.
create or replace function public.check_member_access(p_email text, p_product_slug text)
returns table(
  has_access boolean,
  reason text,
  monthly_limit integer,
  monthly_used integer,
  monthly_remaining integer
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user_id uuid;
  v_enrollment record;
  v_limit integer;
  v_used integer := 0;
begin
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;

  if v_user_id is null then
    return query select false, 'email_not_found'::text, null::integer, null::integer, null::integer;
    return;
  end if;

  select e.is_active, e.expires_at into v_enrollment
  from public.enrollments e
  join public.products p on p.id = e.product_id
  where e.user_id = v_user_id and p.slug = p_product_slug
  limit 1;

  if v_enrollment is null or v_enrollment.is_active is not true then
    return query select false, 'no_active_enrollment'::text, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_enrollment.expires_at is not null and v_enrollment.expires_at < now() then
    return query select false, 'enrollment_expired'::text, null::integer, null::integer, null::integer;
    return;
  end if;

  if p_product_slug = 'mentoria-nps' then
    v_limit := 5;
    select count(*) into v_used
    from public.mapa_7_esferas_maps
    where user_id = v_user_id
      and created_at >= date_trunc('month', now());

    if v_used >= v_limit then
      return query select false, 'monthly_limit_reached'::text, v_limit, v_used, 0;
      return;
    end if;

    return query select true, 'ok'::text, v_limit, v_used, (v_limit - v_used);
    return;
  end if;

  return query select true, 'ok'::text, null::integer, null::integer, null::integer;
end;
$$;

revoke all on function public.check_member_access(text, text) from public;
grant execute on function public.check_member_access(text, text) to service_role;
