-- get_alunos_para_cobranca estava trazendo TODAS as parcelas com status='pendente',
-- inclusive vencimentos de meses futuros (ex: parcela de outubro aparecendo em julho).
-- Corrige pra só considerar: atrasadas (qualquer mês) + a pendente deste mês.
CREATE OR REPLACE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id        UUID,
  aluno_nome      TEXT,
  telefone        TEXT,
  pagamento_id    UUID,
  valor           NUMERIC,
  parcela         INTEGER,
  data_vencimento DATE,
  dias_offset     INTEGER,
  link_pagamento  TEXT
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
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento
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
