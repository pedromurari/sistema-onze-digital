-- Permite plano com valores diferentes do padrao (ex: promo de reativacao
-- de lead antigo, R$997/R$110 em vez de R$1500/R$150) -- quantidade de
-- parcelas continua igual (12x cartao, 15x boleto/recorrente), so o valor
-- por parcela/avista muda. p_valor_avista/p_valor_parcela NULL = padrao.
DROP FUNCTION IF EXISTS public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text
);

CREATE OR REPLACE FUNCTION public.matricula_time_comercial_criar(
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
  p_forma_pagamento text,
  p_dia_vencimento integer,
  p_codigo_bolsa text,
  p_vendedor text,
  p_canal text,
  p_valor_avista numeric DEFAULT NULL,
  p_valor_parcela numeric DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone9 text := right(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), 9);
  v_existente json;
  v_forma text;
  v_valor numeric;
  v_total_mensalidades integer;
  v_novo_id uuid;
BEGIN
  IF coalesce(trim(p_nome), '') = '' THEN
    RETURN json_build_object('ok', false, 'erro', 'nome_obrigatorio');
  END IF;

  v_existente := matricula_checar_existente(coalesce(p_email, ''), v_phone9);
  IF (v_existente->>'aluno_id') IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'ja_matriculado', 'aluno_id', v_existente->>'aluno_id');
  END IF;

  v_forma := lower(coalesce(p_forma_pagamento, ''));
  IF v_forma NOT IN ('avista', 'cartao', 'cartao_recorrente', 'boleto', 'bolsa') THEN
    RETURN json_build_object('ok', false, 'erro', 'forma_pagamento_invalida');
  END IF;

  -- cartao_recorrente = 15x (igual boleto); cartao (parcelado) = 12x --
  -- corrigido 2026-09-04 (recorrente era 12x por engano ate entao).
  v_valor := CASE
    WHEN v_forma = 'avista' THEN COALESCE(p_valor_avista, 1500)
    WHEN v_forma IN ('cartao', 'cartao_recorrente', 'boleto') THEN COALESCE(p_valor_parcela, 150)
    ELSE 0
  END;

  v_total_mensalidades := CASE
    WHEN v_forma = 'avista' THEN 1
    WHEN v_forma = 'cartao' THEN 12
    WHEN v_forma IN ('cartao_recorrente', 'boleto') THEN 15
    ELSE 0
  END;

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
    'psicanalise', 'time_comercial', p_vendedor,
    NULL, 'ativo', current_date,
    CASE WHEN v_forma = 'bolsa' THEN 'bolsa' ELSE 'mensalidade' END,
    CASE WHEN v_forma = 'bolsa' THEN NULL ELSE v_forma END,
    v_valor,
    CASE WHEN v_forma = 'boleto' THEN p_dia_vencimento ELSE NULL END,
    v_total_mensalidades,
    CASE WHEN v_forma = 'bolsa' AND coalesce(trim(p_codigo_bolsa), '') <> ''
      THEN 'Canal: ' || coalesce(p_canal, 'Direto') || E'\nCódigo de bolsa informado: ' || trim(p_codigo_bolsa)
      ELSE 'Canal: ' || coalesce(p_canal, 'Direto')
    END
  )
  RETURNING id INTO v_novo_id;

  RETURN json_build_object('ok', true, 'aluno_id', v_novo_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text, numeric, numeric
) TO anon, authenticated;

COMMENT ON FUNCTION public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text, numeric, numeric
) IS
  'Cria matricula (aluno) a partir da ficha publica /matricula/:vendedor (ou /promo) do Time Comercial. SECURITY DEFINER. p_valor_avista/p_valor_parcela permitem plano com preco diferente do padrao (1500/150) -- ex: promo de reativacao (997/110). cartao_recorrente=15x, cartao (parcelado)=12x, boleto=15x.';
