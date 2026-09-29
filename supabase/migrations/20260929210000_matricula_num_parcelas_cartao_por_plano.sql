-- matricula_time_comercial_criar hardcodeava total_mensalidades=12 pra QUALQUER
-- forma_pagamento='cartao', não importa o plano. Isso já estava errado antes (o
-- "997", cartão em 1x, gravava total_mensalidades=12 mesmo assim -- inofensivo só
-- porque nada usava esse número pra ele), mas virou um bug de verdade com o plano
-- "1000x15" (cartão em 15x FIXAS): o aluno era gravado com total_mensalidades=12,
-- e o contrato (autentique-criar lê alunos.total_mensalidades como num_parcelas)
-- ia sair dizendo "12x" só que cobrando de verdade em 15x -- contradição entre o
-- que o aluno paga e o que o contrato registra.
--
-- Novo parâmetro opcional p_num_parcelas: quando informado, sobrescreve o valor
-- padrão da forma de pagamento. O front-end (MatriculaTimeComercial.tsx) passa
-- plano.cartaoMaxParcelas pra cartão -- default continua 12 pra quem não manda
-- nada (compat com integrações antigas que não conhecem esse parâmetro).
CREATE OR REPLACE FUNCTION public.matricula_time_comercial_criar(
  p_nome text, p_email text, p_whatsapp text, p_cpf text, p_rg text, p_sexo text,
  p_data_nascimento date, p_pais text, p_endereco text, p_cep text, p_cidade_estado text,
  p_forma_pagamento text, p_dia_vencimento integer, p_codigo_bolsa text,
  p_vendedor text, p_canal text,
  p_valor_avista numeric DEFAULT NULL::numeric,
  p_valor_parcela numeric DEFAULT NULL::numeric,
  p_plano_slug text DEFAULT NULL::text,
  p_data_primeiro_pagamento date DEFAULT NULL::date,
  p_num_parcelas integer DEFAULT NULL::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_phone9 text := right(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), 9);
  v_existente json;
  v_forma text;
  v_valor numeric;
  v_total_mensalidades integer;
  v_novo_id uuid;
  v_data_matricula date;
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

  -- Pré-matrícula (data futura) só vale pra boleto -- nas demais formas a
  -- cobrança é síncrona (PIX/cartão na hora), não tem "programar".
  v_data_matricula := CASE
    WHEN v_forma = 'boleto' AND p_data_primeiro_pagamento IS NOT NULL AND p_data_primeiro_pagamento > current_date
      THEN p_data_primeiro_pagamento
    ELSE current_date
  END;

  v_valor := CASE
    WHEN v_forma = 'avista' THEN COALESCE(p_valor_avista, 1500)
    WHEN v_forma IN ('cartao', 'cartao_recorrente', 'boleto') THEN COALESCE(p_valor_parcela, 150)
    ELSE 0
  END;

  v_total_mensalidades := COALESCE(p_num_parcelas, CASE
    WHEN v_forma = 'avista' THEN 1
    WHEN v_forma = 'cartao' THEN 12
    WHEN v_forma IN ('cartao_recorrente', 'boleto') THEN 15
    ELSE 0
  END);

  INSERT INTO public.alunos (
    nome, email, whatsapp, cpf, rg, sexo, data_nascimento,
    pais, endereco, cep, cidade_estado,
    produto, origem_lead, vendedor_id,
    turma_id, status, data_matricula,
    tipo_pagamento, forma_pagamento, valor_mensalidade, dia_vencimento,
    total_mensalidades, plano_slug,
    observacoes
  ) VALUES (
    trim(p_nome), nullif(trim(p_email), ''), nullif(trim(p_whatsapp), ''), nullif(trim(p_cpf), ''), nullif(trim(p_rg), ''),
    nullif(trim(p_sexo), ''), p_data_nascimento,
    coalesce(nullif(trim(p_pais), ''), 'Brasil'), nullif(trim(p_endereco), ''), nullif(trim(p_cep), ''), nullif(trim(p_cidade_estado), ''),
    'psicanalise', 'time_comercial', p_vendedor,
    NULL, 'ativo', v_data_matricula,
    CASE WHEN v_forma = 'bolsa' THEN 'bolsa' ELSE 'mensalidade' END,
    CASE WHEN v_forma = 'bolsa' THEN NULL ELSE v_forma END,
    v_valor,
    CASE WHEN v_forma = 'boleto' THEN p_dia_vencimento ELSE NULL END,
    v_total_mensalidades, nullif(trim(p_plano_slug), ''),
    CASE WHEN v_forma = 'bolsa' AND coalesce(trim(p_codigo_bolsa), '') <> ''
      THEN 'Canal: ' || coalesce(p_canal, 'Direto') || E'\nCódigo de bolsa informado: ' || trim(p_codigo_bolsa)
      WHEN v_data_matricula > current_date
        THEN 'Canal: ' || coalesce(p_canal, 'Direto') || E'\nPré-matrícula: 1ª cobrança programada para ' || to_char(v_data_matricula, 'DD/MM/YYYY')
      ELSE 'Canal: ' || coalesce(p_canal, 'Direto')
    END
  )
  RETURNING id INTO v_novo_id;

  RETURN json_build_object('ok', true, 'aluno_id', v_novo_id, 'data_matricula', v_data_matricula);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text,
  numeric, numeric, text, date, integer
) TO anon, authenticated;
