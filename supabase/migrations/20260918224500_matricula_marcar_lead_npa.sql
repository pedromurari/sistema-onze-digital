-- Quando alguem se matricula pelo link do evento presencial (ex: /matricula/curitiba),
-- o lead correspondente no Kanban do NPA (IDM PSI #20 - Curitiba, app operacao-onze-digital,
-- mesma base Supabase) precisa mover sozinho pra fase "Matricula" -- anon nao tem
-- policy de UPDATE em npa_evento_leads (so INSERT, ver public_insert_npa_leads),
-- entao via RPC SECURITY DEFINER, mesmo padrao de matricula_vincular_turma_evento.
-- Casa por telefone (ultimos 9 digitos, mesma normalizacao de
-- matricula_checar_existente) dentro do evento certo -- se nao achar o lead
-- (matriculou sem ter passado pelo Kanban antes), so retorna ok:false sem erro,
-- matricula continua normal.
create or replace function public.matricula_marcar_lead_npa(p_npa_evento_id uuid, p_whatsapp text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_phone9 text := right(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), 9);
  v_lead_id uuid;
begin
  if v_phone9 = '' then
    return json_build_object('ok', false, 'erro', 'whatsapp_vazio');
  end if;

  select id into v_lead_id
  from public.npa_evento_leads
  where npa_evento_id = p_npa_evento_id
    and right(regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g'), 9) = v_phone9
  limit 1;

  if v_lead_id is null then
    return json_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  end if;

  update public.npa_evento_leads set matriculado = true where id = v_lead_id;

  return json_build_object('ok', true, 'lead_id', v_lead_id);
end;
$function$;

grant execute on function public.matricula_marcar_lead_npa(uuid, text) to anon;
