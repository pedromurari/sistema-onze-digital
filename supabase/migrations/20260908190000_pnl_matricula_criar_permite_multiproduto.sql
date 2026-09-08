-- pnl_matricula_criar rejeitava a matricula sempre que ja existia QUALQUER
-- aluno com o mesmo email -- correto pra evitar duplicar a mesma matricula
-- de psicanalise, mas errado pro caso real do PNL: e pratica comum da Helen
-- ofertar o Master pra quem ja e aluno de Psicanalise (visto na ficha da
-- Rosangela Souza de Brito, observacao "ofertar o MASTER" -- 2026-09-08).
-- Uma pessoa pode legitimamente ter 2 matriculas (produtos diferentes) com
-- o mesmo email. A checagem de duplicidade agora e por email + produto,
-- nao so por email.
CREATE OR REPLACE FUNCTION public.pnl_matricula_criar(
  p_nome text,
  p_email text,
  p_whatsapp text,
  p_cpf text,
  p_rg text,
  p_sexo text,
  p_data_nascimento date,
  p_pais text,
  p_endereco text,
  p_cep text,
  p_cidade_estado text,
  p_produto text,
  p_forma_pagamento text,
  p_valor_parcela numeric,
  p_num_parcelas integer,
  p_dia_vencimento integer,
  p_vendedor text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_forma text;
  v_aluno_existente_id uuid;
  v_novo_id uuid;
BEGIN
  IF coalesce(trim(p_nome), '') = '' THEN
    RETURN json_build_object('ok', false, 'erro', 'nome_obrigatorio');
  END IF;

  IF p_produto NOT IN ('pnl-practitioner', 'pnl-master') THEN
    RETURN json_build_object('ok', false, 'erro', 'produto_invalido');
  END IF;

  v_forma := lower(coalesce(p_forma_pagamento, ''));
  IF v_forma NOT IN ('avista', 'cartao', 'boleto') THEN
    RETURN json_build_object('ok', false, 'erro', 'forma_pagamento_invalida');
  END IF;

  IF p_valor_parcela IS NULL OR p_valor_parcela <= 0 THEN
    RETURN json_build_object('ok', false, 'erro', 'valor_invalido');
  END IF;

  IF p_num_parcelas IS NULL OR p_num_parcelas < 1 THEN
    RETURN json_build_object('ok', false, 'erro', 'parcelas_invalidas');
  END IF;

  -- Duplicidade agora e checada por email + produto (nao so email) -- uma
  -- pessoa pode ser aluna de psicanalise E comprar o PNL Master depois,
  -- sao matriculas/produtos diferentes.
  SELECT id INTO v_aluno_existente_id
  FROM public.alunos
  WHERE email = nullif(trim(p_email), '') AND produto = p_produto
  LIMIT 1;

  IF v_aluno_existente_id IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'ja_matriculado', 'aluno_id', v_aluno_existente_id);
  END IF;

  INSERT INTO public.alunos (
    nome, email, whatsapp, cpf, rg, sexo, data_nascimento,
    pais, endereco, cep, cidade_estado,
    produto, origem_lead, vendedor_id,
    turma_id, status, data_matricula,
    tipo_pagamento, forma_pagamento, valor_mensalidade, dia_vencimento,
    total_mensalidades,
    observacoes
  ) VALUES (
    trim(p_nome), nullif(trim(p_email), ''), nullif(trim(p_whatsapp), ''), nullif(trim(p_cpf), ''), nullif(trim(p_rg), ''),
    nullif(trim(p_sexo), ''), p_data_nascimento,
    coalesce(nullif(trim(p_pais), ''), 'Brasil'), nullif(trim(p_endereco), ''), nullif(trim(p_cep), ''), nullif(trim(p_cidade_estado), ''),
    p_produto, 'pnl_manual', p_vendedor,
    NULL, 'ativo', current_date,
    'mensalidade', v_forma, p_valor_parcela,
    CASE WHEN v_forma = 'boleto' THEN p_dia_vencimento ELSE NULL END,
    p_num_parcelas,
    'Matricula PNL registrada manualmente -- pagamento negociado e cobrado por fora do sistema (link avulso).'
  )
  RETURNING id INTO v_novo_id;

  RETURN json_build_object('ok', true, 'aluno_id', v_novo_id);
END;
$$;

COMMENT ON FUNCTION public.pnl_matricula_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, text, numeric, integer, integer, text
) IS
  'Registra matricula manual de PNL Practitioner/Master (venda negociada pela Helen, cobranca por fora). status entra ativo direto (pagamento ja confirmado antes do preenchimento). Duplicidade checada por email+produto (permite mesma pessoa ter psicanalise + PNL). Usado pela tela /pnl-contrato.';
