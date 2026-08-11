-- Desligar o toggle "Automático" na Fila fazia o aluno sumir da tela inteira
-- (a RPC filtrava cobranca_ativa=TRUE), quando o esperado era ele continuar
-- visível ali, só "apagado"/sem disparo automático -- pra o time não perder
-- o aluno de vista, só parar de cobrar ele sozinho. cobranca_ativa passa a
-- ser só informativo aqui (não filtra mais), e quem garante que o aluno
-- desligado não recebe cobrança automática de verdade é
-- resolveTemplateParaItem em enviar-cobranca/index.ts, que já faz esse tipo
-- de checagem pro caso de data_prevista_pagamento.
DROP FUNCTION IF EXISTS public.get_alunos_para_cobranca(DATE);

CREATE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id                UUID,
  aluno_nome              TEXT,
  telefone                TEXT,
  pagamento_id            UUID,
  valor                   NUMERIC,
  parcela                 INTEGER,
  data_vencimento         DATE,
  dias_offset             INTEGER,
  link_pagamento          TEXT,
  pagamento_status        TEXT,
  data_prevista_pagamento DATE,
  cobranca_ia_ativa       BOOLEAN,
  cobranca_ativa          BOOLEAN
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
    p.status        AS pagamento_status,
    p.data_prevista_pagamento,
    a.cobranca_ia_ativa,
    a.cobranca_ativa
  FROM public.pagamentos p
  JOIN public.alunos     a   ON a.id = p.aluno_id
  JOIN public.cobranca_turmas_ativas cta ON cta.turma_id = a.turma_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
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
