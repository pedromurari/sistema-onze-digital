-- CRITICO, achado pelo dono do produto (2026-11-12) durante teste do botao
-- de cancelar pre-matricula. Tres funcoes SECURITY DEFINER do Time
-- Comercial checavam permissao com "IF NOT (v_admin OR x = v_nome) THEN
-- nega". Quando a chamada nao tem usuario logado (ex: so a anon key
-- publica, sem JWT de sessao), auth.uid() e NULL, v_nome fica NULL, e
-- "x = NULL" avalia pra NULL (nao pra false) -- em PL/pgSQL "IF NULL THEN"
-- e tratado como falso, ou seja, o bloqueio de permissao NUNCA disparava
-- nesse caso e a funcao executava como se tivesse passado. Confirmado na
-- pratica: chamar time-comercial-pre-matricula-cancelar so com a anon key
-- (sem login nenhum) passou direto pela checagem de permissao.
--
-- Isso significava que QUALQUER pessoa sem login, sabendo so um aluno_id,
-- conseguia: cancelar a pre-matricula de qualquer aluno (boleto Asaas +
-- contrato Autentique), mudar a data de pagamento previsto de qualquer um,
-- ou editar nome/e-mail/whatsapp/CPF de qualquer aluno.
--
-- Fix: coalesce(..., false) em volta da condicao inteira -- NULL vira
-- false (nega) em vez de ser tratado como "nao bloqueia".
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
  IF NOT coalesce(v_admin OR v_aluno.vendedor_id = v_nome, false) THEN
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
  IF NOT coalesce(v_admin OR v_aluno.vendedor_id = v_nome, false) THEN
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

CREATE OR REPLACE FUNCTION public.time_comercial_aluno_atualizar_dados_pessoais(
  p_aluno_id uuid, p_nome text, p_email text, p_whatsapp text, p_cpf text, p_rg text,
  p_data_nascimento date, p_sexo text, p_pais text, p_cep text, p_cidade_estado text, p_endereco text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role);
  v_nome text := (SELECT p.nome FROM public.profiles p WHERE p.id = auth.uid());
  v_dono text;
BEGIN
  SELECT a.vendedor_id INTO v_dono FROM public.alunos a WHERE a.id = p_aluno_id;
  IF v_dono IS NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'aluno_nao_encontrado');
  END IF;
  IF NOT coalesce(v_admin OR v_dono = v_nome, false) THEN
    RETURN json_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;
  IF coalesce(trim(p_nome), '') = '' THEN
    RETURN json_build_object('ok', false, 'erro', 'nome_obrigatorio');
  END IF;

  UPDATE public.alunos SET
    nome = trim(p_nome),
    email = nullif(trim(p_email), ''),
    whatsapp = coalesce(normalizar_telefone(p_whatsapp), nullif(trim(p_whatsapp), '')),
    cpf = nullif(trim(p_cpf), ''),
    rg = nullif(trim(p_rg), ''),
    data_nascimento = p_data_nascimento,
    sexo = nullif(trim(p_sexo), ''),
    pais = nullif(trim(p_pais), ''),
    cep = nullif(trim(p_cep), ''),
    cidade_estado = nullif(trim(p_cidade_estado), ''),
    endereco = nullif(trim(p_endereco), '')
  WHERE id = p_aluno_id;

  RETURN json_build_object('ok', true);
END;
$function$;
