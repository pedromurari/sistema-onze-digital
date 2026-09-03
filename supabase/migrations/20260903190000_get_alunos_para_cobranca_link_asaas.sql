-- get_alunos_para_cobranca ainda so conhecia link_pagamento_mp (boleto MP,
-- descontinuado) -- desde 2026-09-03 os boletos da matricula Time Comercial
-- sao gerados via Asaas (link_pagamento_asaas), entao os avisos de vencimento
-- estavam saindo sem link nenhum pra essas parcelas. Adiciona asaas na frente
-- do mp (mp fica so como fallback historico de parcelas antigas).
CREATE OR REPLACE FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("aluno_id" "uuid", "aluno_nome" "text", "telefone" "text", "pagamento_id" "uuid", "valor" numeric, "parcela" integer, "data_vencimento" "date", "dias_offset" integer, "link_pagamento" "text", "pagamento_status" "text", "data_prevista_pagamento" "date", "cobranca_ia_ativa" boolean, "cobranca_ativa" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions', 'net', 'cron', 'pg_temp'
    AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(p.link_pagamento_asaas, p.link_pagamento_mp, a.asaas_link, a.voomp_link, '') AS link_pagamento,
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

COMMENT ON COLUMN public.pagamentos.link_pagamento_asaas IS 'Link do boleto/fatura (invoiceUrl, com opcao de Pix junto) no Asaas -- usado por get_alunos_para_cobranca como link_pagamento, com prioridade sobre link_pagamento_mp/asaas_link/voomp_link.';
