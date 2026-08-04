-- get_alunos_para_cobranca só trazia 'pendente' quando o vencimento caía no
-- MESMO MÊS da data de referência. Isso é necessário pros templates
-- pre_vencimento (offset negativo, lembrete antes de vencer) funcionarem, mas
-- tinha um efeito colateral ruim: um boleto 'pendente' vencido em MÊS
-- ANTERIOR (nunca atualizado pra 'atrasado' no banco) ficava de fora da fila
-- pra sempre — nunca virava candidato a cobrança nem contava como
-- inadimplente, mesmo estando genuinamente vencido.
-- Fix: mantém o "mesmo mês" (pra continuar cobrindo os lembretes de
-- pré-vencimento) e ADICIONA qualquer 'pendente' cujo vencimento já passou,
-- não importa o mês — mesma regra canônica de financial-utils.ts
-- (isPagamentoInadimplente): 'atrasado' literal, OU 'pendente' vencido.
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
      OR (p.status = 'pendente' AND p.data_vencimento < p_data)
    )
    AND COALESCE(a.cobranca_telefone, a.whatsapp) IS NOT NULL
    AND COALESCE(a.cobranca_telefone, a.whatsapp) <> ''
  ORDER BY a.nome, p.data_vencimento;
$$;
