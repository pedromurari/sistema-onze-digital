-- get_alunos_para_cobranca não devolvia pagamento_status, mas o frontend
-- (FilaItem.pagamento_status) sempre dependeu desse campo pra marcar quem é
-- inadimplente (badge vermelho, KPI de inadimplentes, resumo do disparo em
-- lote). Como o campo nunca vinha preenchido, ninguém nunca aparecia marcado
-- como inadimplente na tela -- mesmo recebendo cobrança de verdade. Mesma
-- lógica de filtro de sempre, só passa a devolver o dado que já existe em
-- pagamentos.status.
DROP FUNCTION IF EXISTS public.get_alunos_para_cobranca(DATE);

CREATE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id         UUID,
  aluno_nome       TEXT,
  telefone         TEXT,
  pagamento_id     UUID,
  valor            NUMERIC,
  parcela          INTEGER,
  data_vencimento  DATE,
  dias_offset      INTEGER,
  link_pagamento   TEXT,
  pagamento_status TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento,
    p.status        AS pagamento_status
  FROM public.pagamentos p
  JOIN public.alunos     a   ON a.id = p.aluno_id
  JOIN public.cobranca_turmas_ativas cta ON cta.turma_id = a.turma_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
    AND a.cobranca_ativa = TRUE
    AND a.forma_pagamento = 'boleto'
    AND (
      p.status = 'atrasado'
      OR (p.status = 'pendente' AND date_trunc('month', p.data_vencimento) = date_trunc('month', p_data))
    )
    AND COALESCE(a.cobranca_telefone, a.whatsapp) IS NOT NULL
    AND COALESCE(a.cobranca_telefone, a.whatsapp) <> ''
  ORDER BY a.nome, p.data_vencimento;
$$;
