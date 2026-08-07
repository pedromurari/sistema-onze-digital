-- Previsão de pagamento por parcela: quando o aluno dá uma estimativa ("pago sexta") ao ser
-- cobrado (automaticamente ou manualmente, inclusive fora do sistema pelo WhatsApp pessoal do
-- operador), fica registrada aqui em vez de só na cabeça de quem cobrou. Nullable -- nem toda
-- parcela em atraso tem uma previsão dada. Pronta pra também ser preenchida pela IA de cobrança
-- (cobranca_ia_conversas/cobranca-ia-responder) no futuro, quando isso for implementado.
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS data_prevista_pagamento DATE;

-- get_alunos_para_cobranca tem RETURNS TABLE com lista explícita de colunas -- precisa expor
-- a coluna nova pro card da Fila conseguir mostrar/editar a previsão sem um select extra.
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
  data_prevista_pagamento DATE
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
    p.data_prevista_pagamento
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
