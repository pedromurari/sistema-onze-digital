-- Pedido do dono do produto (2026-11-12): a vendedora precisa poder cancelar
-- sozinha uma pré-matrícula que o aluno desistiu de fechar, sem precisar
-- passar pro dono toda vez. Mesma trava de permissão de sempre (admin/gestor
-- vê/edita qualquer um; vendedora só o próprio vendedor_id) e mesma regra de
-- escopo da pagamento_previsto_atualizar: só vale pra pré-matrícula, nunca
-- pra quem já é aluno ativo/pagante -- cancelar uma matrícula de verdade
-- continua sendo decisão do financeiro/dono, não da vendedora.
--
-- Esta RPC só marca o estado local (alunos.status='cancelado' + parcelas
-- pendentes viram 'isento') e devolve os asaas_payment_id/autentique_documento_id
-- que precisam ser cancelados nas APIs externas -- isso quem faz é a edge
-- function time-comercial-pre-matricula-cancelar (só ela tem as chaves da
-- Asaas/Autentique), chamada logo em seguida com o resultado desta RPC.
CREATE OR REPLACE FUNCTION public.time_comercial_cancelar_pre_matricula(p_aluno_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
  v_aluno record;
  v_asaas_ids text[];
BEGIN
  SELECT vendedor_id, status, nome, autentique_documento_id INTO v_aluno FROM public.alunos WHERE id = p_aluno_id;
  IF v_aluno IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'aluno_nao_encontrado');
  END IF;
  IF NOT (v_admin OR v_aluno.vendedor_id = v_nome) THEN
    RETURN json_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF v_aluno.status <> 'pre_matricula' THEN
    RETURN json_build_object('ok', false, 'erro', 'so_vale_pre_matricula');
  END IF;

  SELECT array_agg(asaas_payment_id) INTO v_asaas_ids
  FROM public.pagamentos
  WHERE aluno_id = p_aluno_id AND asaas_payment_id IS NOT NULL AND status <> 'pago';

  UPDATE public.pagamentos
  SET status = 'isento', observacoes = coalesce(observacoes || ' | ', '') || 'Pré-matrícula cancelada pela vendedora em ' || to_char(now(), 'DD/MM/YYYY') || ' -- aluno desistiu antes de fechar.'
  WHERE aluno_id = p_aluno_id AND status = 'pendente';

  UPDATE public.alunos SET status = 'cancelado' WHERE id = p_aluno_id;

  RETURN json_build_object(
    'ok', true,
    'aluno_nome', v_aluno.nome,
    'asaas_payment_ids', to_jsonb(coalesce(v_asaas_ids, ARRAY[]::text[])),
    'autentique_documento_id', v_aluno.autentique_documento_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.time_comercial_cancelar_pre_matricula(uuid) TO authenticated;
