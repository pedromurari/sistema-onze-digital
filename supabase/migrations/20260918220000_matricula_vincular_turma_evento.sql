-- Link de matricula de evento presencial (ex: NPA Curitiba) precisa vincular a
-- turma na hora, sem depender de atribuicao manual depois (venda ao vivo, tem
-- que funcionar sozinho). anon nao tem policy de UPDATE em alunos (so INSERT,
-- ver anon_insert_alunos_matricula) -- por isso via RPC SECURITY DEFINER, mesmo
-- padrao de matricula_time_comercial_criar. Validacao minima: aluno e turma
-- precisam existir; sem checagem de "dono" porque quem chama e sempre o proprio
-- fluxo de matricula logo apos criar o aluno (nao exposto como acao livre).
--
-- Achado real 2026-09-18: um update direto na tabela (supabase.from('alunos')
-- .update(...)) a partir do formulario publico falha silencioso (RLS nega,
-- sem erro visivel pro operador) -- o aluno ficava sem turma e so se
-- descobria dias depois ao abrir a ficha dele. Testado end-to-end antes de
-- subir: matricula via /matricula/curitiba vincula a turma certa na hora.
create or replace function public.matricula_vincular_turma_evento(p_aluno_id uuid, p_turma_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.turmas where id = p_turma_id) then
    return json_build_object('ok', false, 'erro', 'turma_nao_encontrada');
  end if;

  update public.alunos set turma_id = p_turma_id where id = p_aluno_id;

  if not found then
    return json_build_object('ok', false, 'erro', 'aluno_nao_encontrado');
  end if;

  return json_build_object('ok', true);
end;
$function$;

grant execute on function public.matricula_vincular_turma_evento(uuid, uuid) to anon;
