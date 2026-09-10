-- Card "Atividade do vendedor" (aba Dados), 3 números do dia:
--  1) "leads que pegou"  -> só evento 'atribuicao' (clicou em pegar lead).
--     Antes contava qualquer movimentação, incluindo 'criacao' (import do
--     sistema) e arrastar card -- inflava.
--  2) "msgs enviadas"    -> mensagens REAIS enviadas pelo número integrado
--     do vendedor (whatsapp_mensagens, direcao='enviada'), não mais o
--     clique no botão de WhatsApp do card.
--  3) "ligações"         -> inalterado (registro manual no card).
CREATE OR REPLACE FUNCTION public.time_comercial_movimentacao_dia(dias integer DEFAULT 7)
RETURNS TABLE(vendedor text, dia date, tipo text, eventos bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    vendedor,
    (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    'movimentacao'::text AS tipo,
    count(*) AS eventos
  FROM public.leads_historico_fase
  WHERE vendedor IS NOT NULL
    AND origem_mudanca = 'atribuicao'
    AND criado_em >= now() - (dias || ' days')::interval
  GROUP BY vendedor, dia

  UNION ALL

  SELECT
    vendedor,
    (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    'contato_ligacao'::text AS tipo,
    count(*) AS eventos
  FROM public.leads_historico_fase
  WHERE vendedor IS NOT NULL
    AND origem_mudanca = 'contato_ligacao'
    AND criado_em >= now() - (dias || ' days')::interval
  GROUP BY vendedor, dia

  UNION ALL

  SELECT
    CASE m.evolution_instance
      WHEN 'Helen vendas'  THEN 'Helen Magna'
      WHEN 'Miguel vendas' THEN 'Miguel Fogaça'
    END AS vendedor,
    (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    'contato_whatsapp'::text AS tipo,
    count(*) AS eventos
  FROM public.whatsapp_mensagens m
  WHERE m.direcao = 'enviada'
    AND m.evolution_instance IN ('Helen vendas', 'Miguel vendas')
    AND m.created_at >= now() - (dias || ' days')::interval
  GROUP BY 1, 2;
$function$;
