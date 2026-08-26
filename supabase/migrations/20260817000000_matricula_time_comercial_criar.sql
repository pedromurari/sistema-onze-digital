-- Ficha de matrícula pública do Time Comercial (paralela à matricula.html do
-- Igor, que está com "permission denied for table leads" -- anon tem INSERT
-- em leads mas nao tem SELECT, entao qualquer `.insert().select()` do lado
-- do cliente quebra com esse erro mesmo com a policy de insert correta).
--
-- Em vez de repetir esse padrao (GRANT largo pra anon + insert direto pelo
-- cliente), esta função roda com SECURITY DEFINER: o cliente (anon) só
-- precisa de permissão pra EXECUTAR a função, nunca ganha SELECT/INSERT
-- direto em `alunos`/`pagamentos`. Mesmo padrão já usado aqui em
-- matricula_checar_existente/portal_aluno_por_token.
--
-- Escopo deliberadamente pequeno: só cria o registro em `alunos` com
-- turma_id = NULL e vendedor_id = quem vendeu. A geração de parcelas
-- (sincronizarParcelasAluno / assignTurmaEAtualizarParcelas, já existente
-- em src/lib/parcelasAluno.ts) roda depois, quando o vendedor atribui a
-- turma pela aba Operação -- não duplica essa lógica aqui.

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
  p_forma_pagamento text,      -- 'avista' | 'cartao' | 'boleto' | 'bolsa'
  p_dia_vencimento integer,    -- só relevante pra boleto
  p_codigo_bolsa text,         -- só relevante pra bolsa (guardado em observacoes, sem validação automática ainda)
  p_vendedor text,
  p_canal text
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

  -- Mesma checagem de duplicidade que a ficha antiga já usava.
  v_existente := matricula_checar_existente(coalesce(p_email, ''), v_phone9);
  IF (v_existente->>'aluno_id') IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'erro', 'ja_matriculado', 'aluno_id', v_existente->>'aluno_id');
  END IF;

  v_forma := lower(coalesce(p_forma_pagamento, ''));
  IF v_forma NOT IN ('avista', 'cartao', 'boleto', 'bolsa') THEN
    RETURN json_build_object('ok', false, 'erro', 'forma_pagamento_invalida');
  END IF;

  v_valor := CASE
    WHEN v_forma = 'avista' THEN 1500
    WHEN v_forma IN ('cartao', 'boleto') THEN 150
    ELSE 0
  END;

  -- alunos.total_mensalidades tem DEFAULT 15 na tabela -- sem gravar
  -- explicitamente aqui, avista (1 pagamento) e cartão (12x) herdavam esse
  -- default errado (achado em teste real 2026-08-26, o contrato mostrava
  -- "cartão 15x" em vez de "cartão 12x"). Boleto já batia com o default por
  -- coincidência.
  v_total_mensalidades := CASE
    WHEN v_forma = 'avista' THEN 1
    WHEN v_forma = 'cartao' THEN 12
    WHEN v_forma = 'boleto' THEN 15
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

-- anon pode só EXECUTAR a função -- nunca ganha SELECT/INSERT direto na
-- tabela alunos, diferente do que aconteceu com `leads`.
GRANT EXECUTE ON FUNCTION public.matricula_time_comercial_criar(
  text, text, text, text, text, text, date, text, text, text, text, text, integer, text, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.matricula_time_comercial_criar IS
  'Cria matrícula (aluno) a partir da ficha pública /matricula/:vendedor do Time Comercial. SECURITY DEFINER para não precisar dar SELECT/INSERT direto em alunos pro anon -- ver nota da migration. Grava total_mensalidades explicitamente por plano (corrigido 2026-08-26, antes usava o DEFAULT 15 da coluna mesmo pra avista/cartão).';
