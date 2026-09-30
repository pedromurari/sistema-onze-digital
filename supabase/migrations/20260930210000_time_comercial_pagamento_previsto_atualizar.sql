-- "Pagamento previsto" editável na Minhas Vendas: a vendedora precisa poder
-- mudar a data programada da entrada de uma pré-matrícula (boleto) sozinha,
-- sem pedir pro dono. Só vale pra pré-matrícula em boleto -- não faz sentido
-- pra quem já pagou/já é aluno ativo. Mesma trava de permissão de sempre
-- (admin/gestor vê/edita qualquer um; vendedora só o próprio vendedor_id).
CREATE OR REPLACE FUNCTION public.time_comercial_atualizar_pagamento_previsto(p_aluno_id uuid, p_nova_data date)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
  v_aluno record;
BEGIN
  SELECT vendedor_id, status, forma_pagamento INTO v_aluno FROM public.alunos WHERE id = p_aluno_id;
  IF v_aluno IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'aluno_nao_encontrado');
  END IF;
  IF NOT (v_admin OR v_aluno.vendedor_id = v_nome) THEN
    RETURN json_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF v_aluno.status <> 'pre_matricula' OR v_aluno.forma_pagamento <> 'boleto' THEN
    RETURN json_build_object('ok', false, 'erro', 'so_vale_pre_matricula_boleto');
  END IF;
  IF p_nova_data IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'data_obrigatoria');
  END IF;

  UPDATE public.alunos SET data_matricula = p_nova_data WHERE id = p_aluno_id;

  RETURN json_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_atualizar_pagamento_previsto(uuid, date) TO authenticated;
