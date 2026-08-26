-- Matrícula Time Comercial: plano "boleto" (15x R$150) passa a cobrar a 1ª
-- parcela via PIX (ver supabase/functions/matricula-pagamento-criar) em vez
-- de um boleto real. As 14 parcelas seguintes continuam sendo boletos reais
-- (bolbradesco), mas agora gerados/enviados automaticamente por um cron
-- separado (supabase/functions/matricula-boleto-mensal-gerar) em vez de
-- processo manual -- precisamos guardar o link do boleto que a MP devolve
-- pra esses casos, pra o sistema de cobrança por WhatsApp já existente
-- (get_alunos_para_cobranca / enviar-cobranca) achar e mandar esse link.
--
-- NÃO inclui o cron.schedule() que dispara matricula-boleto-mensal-gerar
-- periodicamente -- isso fica pra ser adicionado à parte depois de revisão
-- da frequência/horário (ver relatório da tarefa).

ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS link_pagamento_mp text;

COMMENT ON COLUMN public.pagamentos.link_pagamento_mp IS 'URL do boleto (bolbradesco) gerado pelo Mercado Pago para essa parcela -- preenchido por matricula-boleto-mensal-gerar (parcelas >=2 do plano boleto do Time Comercial). Usado por get_alunos_para_cobranca como link_pagamento, com prioridade sobre asaas_link/voomp_link.';

-- CREATE OR REPLACE mantém a mesma assinatura (mesmos parâmetros/colunas de
-- retorno) da função original em 00000000000000_baseline_schema.sql:487 --
-- só a expressão de link_pagamento muda, adicionando COALESCE com o boleto
-- da MP (p.link_pagamento_mp) antes dos fallbacks antigos (asaas/voomp).
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
    COALESCE(p.link_pagamento_mp, a.asaas_link, a.voomp_link, '') AS link_pagamento,
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

ALTER FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_alunos_para_cobranca"("p_data" "date") TO "authenticated";
