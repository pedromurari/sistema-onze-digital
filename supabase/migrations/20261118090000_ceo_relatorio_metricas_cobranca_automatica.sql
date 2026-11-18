-- Metricas da cobranca automatica no relatorio do grupo "DP - Financeiro"
-- (WhatsApp enviado/erro/respondido + pagamentos confirmados sozinhos pela
-- Voomp) -- pedido do Pedro 18/11/2026.

CREATE OR REPLACE FUNCTION public.ceo_relatorio_financeiro_texto(p_periodo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_fim date;
  v_label text;
  v_faturamento numeric := 0;
  v_pagamentos_count int := 0;
  v_vendas int := 0;
  v_notas_emitidas int := 0;
  v_notas_erro_total int := 0;
  v_inadimplentes int := 0;
  v_inadimplencia_valor numeric := 0;
  v_cobrancas_enviadas int := 0;
  v_cobrancas_erro int := 0;
  v_cobrancas_responderam int := 0;
  v_voomp_confirmados int := 0;
  v_texto text;
begin
  if p_periodo = 'diario' then
    -- Roda logo depois da meia-noite (BRT) e fecha o dia ANTERIOR -- antes
    -- rodava as 20h e perdia pagamento de ultima hora (achado real do Pedro
    -- em 29/10/2026: aluna pagou depois do relatorio do dia ja ter saido).
    v_inicio := hoje - 1; v_fim := hoje - 1;
    v_label := 'Relatório do dia (' || to_char(v_inicio, 'DD/MM') || ')';
  elsif p_periodo = 'semanal' then
    v_inicio := hoje - 7; v_fim := hoje - 1;
    v_label := 'Relatório da semana passada (' || to_char(v_inicio,'DD/MM') || ' a ' || to_char(v_fim,'DD/MM') || ')';
  elsif p_periodo = 'mensal' then
    v_inicio := (date_trunc('month', hoje) - interval '1 month')::date;
    v_fim := (date_trunc('month', hoje) - interval '1 day')::date;
    v_label := 'Relatório do mês passado (' || to_char(v_inicio,'MM/YYYY') || ')';
  else
    raise exception 'periodo inválido: %', p_periodo;
  end if;

  select coalesce(sum(valor), 0), count(*) into v_faturamento, v_pagamentos_count
  from pagamentos
  where status = 'pago' and data_pagamento between v_inicio and v_fim;

  -- Venda real = parcela 1 (ato de matricula) efetivamente PAGA nesse periodo.
  -- Antes contava por alunos.data_matricula, que e preenchido na hora da
  -- pre-matricula mesmo pra lead que nunca paga nem converte -- inflava
  -- "novas matriculas" com gente que desistiu (achado real 29/10/2026, pedido
  -- do Pedro pra conferir essa conta; ver caso Luiz Matheo, cancelado no
  -- mesmo dia sem nunca ter pago).
  select count(distinct p.aluno_id) into v_vendas
  from pagamentos p
  where p.numero_parcela = 1 and p.status = 'pago'
    and p.data_pagamento between v_inicio and v_fim;

  select count(*) into v_notas_emitidas
  from pagamentos
  where nf_status = 'emitida' and nf_emitida_em::date between v_inicio and v_fim;

  -- Erro de emissao nao tem timestamp proprio -- reporta total pendente
  -- (nao so do periodo) como alerta operacional.
  select count(*) into v_notas_erro_total
  from pagamentos
  where nf_status = 'erro';

  -- Inadimplência é sempre a foto de hoje (não dá pra "inadimplência da
  -- semana passada" retroativa) -- mesma regra canônica da Diretoria
  -- Financeiro: atrasado literal OU pendente com vencimento já passado,
  -- só de aluno ativo.
  select count(*), coalesce(sum(p.valor), 0) into v_inadimplentes, v_inadimplencia_valor
  from pagamentos p
  join alunos a on a.id = p.aluno_id and a.status = 'ativo'
  where p.status = 'atrasado' or (p.status = 'pendente' and p.data_vencimento < hoje);

  -- Cobrança automática por WhatsApp (enviar-cobranca, manual=false) --
  -- métrica da estratégia de cobrança, pedido do Pedro 18/11/2026.
  select
    count(*) filter (where cl.status = 'enviado'),
    count(*) filter (where cl.status = 'erro'),
    count(*) filter (where cl.status = 'enviado' and cl.respondeu_em is not null)
    into v_cobrancas_enviadas, v_cobrancas_erro, v_cobrancas_responderam
  from cobranca_logs cl
  where cl.manual = false
    and (cl.enviado_em at time zone 'America/Sao_Paulo')::date between v_inicio and v_fim;

  -- Pagamentos confirmados sozinhos pelo webhook da Voomp (contractPaid) --
  -- mesma ideia, complementa a cobrança automática pro aluno que paga por lá.
  select count(*) into v_voomp_confirmados
  from pagamentos
  where status = 'pago' and conta_recebimento = 'voomp'
    and observacoes ilike '%Confirmado automaticamente via webhook Voomp%'
    and data_pagamento between v_inicio and v_fim;

  v_texto :=
    '📊 *' || v_label || '*' || E'\n\n' ||
    '💰 Faturamento: R$ ' || to_char(v_faturamento, 'FM999G999G990D00') || ' (' || v_pagamentos_count || ' pagamento(s))' || E'\n' ||
    '🧾 Novas matrículas (venda real): ' || v_vendas || E'\n' ||
    '📄 Notas fiscais emitidas no período: ' || v_notas_emitidas ||
      case when v_notas_erro_total > 0 then E'\n' || '⚠️ Notas com erro de emissão (total pendente): ' || v_notas_erro_total else '' end || E'\n' ||
    '⚠️ Inadimplência (hoje): ' || v_inadimplentes || ' parcela(s) · R$ ' || to_char(v_inadimplencia_valor, 'FM999G999G990D00') || E'\n\n' ||
    '🤖 *Cobrança automática*' || E'\n' ||
    '📲 WhatsApp enviados: ' || v_cobrancas_enviadas ||
      case when v_cobrancas_responderam > 0 then ' (' || v_cobrancas_responderam || ' responderam)' else '' end ||
      case when v_cobrancas_erro > 0 then E'\n' || '⚠️ Falharam ao enviar: ' || v_cobrancas_erro else '' end || E'\n' ||
    '✅ Confirmados sozinhos via Voomp: ' || v_voomp_confirmados;

  return v_texto;
end;
$function$;
