-- Prioriza quem AINDA NAO venceu (dias_offset mais negativo primeiro) sobre
-- quem ja esta atrasado -- antes a ordem era so por nome (alfabetica), e
-- com o limite diario de envios, atraso antigo acumulado competia pela
-- mesma cota com lembrete de vencimento proximo e podia nunca ser avisado
-- a tempo (achado real do Pedro 18/11/2026, as vesperas do fechamento do
-- dia 20 -- so 11 de 33 elegiveis receberam o lembrete de 3 dias antes).

CREATE OR REPLACE FUNCTION public.get_alunos_para_cobranca_automatica(p_data date DEFAULT CURRENT_DATE)
 RETURNS TABLE(aluno_id uuid, aluno_nome text, telefone text, pagamento_id uuid, valor numeric, parcela integer, data_vencimento date, dias_offset integer, link_pagamento text, asaas_payment_id text, asaas_customer_id text, pagamento_status text, data_prevista_pagamento date, cobranca_ia_ativa boolean, cobranca_ativa boolean, produto text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select a.id, a.nome, coalesce(nullif(trim(a.cobranca_telefone), ''), trim(a.whatsapp)),
    p.id, p.valor, p.numero_parcela, p.data_vencimento,
    (p_data - p.data_vencimento)::integer,
    trim(p.link_pagamento_asaas), trim(p.asaas_payment_id),
    trim(a.asaas_customer_id), p.status, p.data_prevista_pagamento,
    a.cobranca_ia_ativa, a.cobranca_ativa, a.produto
  from public.pagamentos p
  join public.alunos a on a.id = p.aluno_id
  join public.cobranca_turmas_ativas cta on cta.turma_id = a.turma_id
  where a.status = 'ativo'
    and a.cobranca_ativa = true
    and a.forma_pagamento = 'boleto'
    and nullif(trim(a.produto), '') is not null
    and nullif(trim(a.asaas_customer_id), '') is not null
    and nullif(trim(coalesce(a.cobranca_telefone, a.whatsapp)), '') is not null
    and p.status in ('pendente', 'atrasado')
    and p.data_vencimento <= (date_trunc('month', p_data)::date + interval '1 month - 1 day')::date
    and nullif(trim(p.asaas_payment_id), '') is not null
    and p.link_pagamento_asaas ~* '^https://(www\.)?asaas\.com/'
  order by (p_data - p.data_vencimento) asc, a.nome;
$function$;
