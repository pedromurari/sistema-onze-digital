-- A régua automática usa somente a parcela Asaas identificada, nunca o link
-- genérico da matrícula nem o link Voomp/DKSoft. A fila manual permanece igual.
begin;
alter table public.cobranca_templates add column if not exists produto text;
comment on column public.cobranca_templates.produto is
  'Produto exato de alunos.produto. NULL é template legado/manual; o motor automático exige produto preenchido.';

create or replace function public.get_alunos_para_cobranca_automatica(p_data date default current_date)
returns table (
  aluno_id uuid, aluno_nome text, telefone text, pagamento_id uuid,
  valor numeric, parcela integer, data_vencimento date, dias_offset integer,
  link_pagamento text, asaas_payment_id text, asaas_customer_id text,
  pagamento_status text, data_prevista_pagamento date,
  cobranca_ia_ativa boolean, cobranca_ativa boolean, produto text
)
language sql stable
set search_path = public, pg_temp
as $function$
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
  order by a.nome, p.data_vencimento;
$function$;

revoke all on function public.get_alunos_para_cobranca_automatica(date) from public, anon, authenticated;
grant execute on function public.get_alunos_para_cobranca_automatica(date) to service_role;

-- Nenhum template global é usado pelo motor automático. Os antigos seguem
-- intactos para consulta e envios manuais. NPS só entra quando tiver sua régua.
insert into public.cobranca_templates
  (nome, tipo, dias_offset, dias_offset_fim, mensagem, ativo, ordem, produto)
select nome, tipo, dias_offset, dias_offset_fim,
  replace(replace(mensagem, E'\\n', E'\n'), 'Excelente dia,', '{{saudacao}},'),
  ativo, ordem, produto
from (values
  ('Psicanálise · 3 dias antes', 'pre_vencimento', -3, -3,
   'Excelente dia, {{nome}}!\n\nPassando para lembrar da mensalidade {{parcela}} do curso de Psicanálise, no valor de R$ {{valor}}, com vencimento em {{vencimento}}.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 20, 'psicanalise'),
  ('Psicanálise · 1 dia antes', 'pre_vencimento', -1, -1,
   'Excelente dia, {{nome}}!\n\nA mensalidade {{parcela}} do curso de Psicanálise vence amanhã, {{vencimento}}. Valor: R$ {{valor}}.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 21, 'psicanalise'),
  ('Psicanálise · vencimento', 'vencimento', 0, 0,
   'Excelente dia, {{nome}}!\n\nHoje, {{vencimento}}, vence sua mensalidade {{parcela}} do curso de Psicanálise, no valor de R$ {{valor}}.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 22, 'psicanalise'),
  ('Psicanálise · 1 a 3 dias', 'pos_vencimento', 1, 3,
   'Excelente dia, {{nome}}!\n\nAinda não identificamos o pagamento da mensalidade {{parcela}} do curso de Psicanálise, vencida em {{vencimento}}. Valor: R$ {{valor}}.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, por favor nos envie o comprovante. Se precisar conversar, estamos por aqui. Financeiro IDM.', true, 23, 'psicanalise'),
  ('Psicanálise · 4 a 7 dias', 'pos_vencimento', 4, 7,
   'Excelente dia, {{nome}}!\n\nA mensalidade {{parcela}} do curso de Psicanálise, de R$ {{valor}}, segue em aberto desde {{vencimento}}. Queremos ajudar você a manter seus estudos em dia.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, envie o comprovante; se precisa ajustar o pagamento, responda aqui. Financeiro IDM.', true, 24, 'psicanalise'),
  ('Psicanálise · 8 a 15 dias', 'pos_vencimento', 8, 15,
   'Excelente dia, {{nome}}!\n\nPrecisamos de uma posição sobre a mensalidade {{parcela}} do curso de Psicanálise, vencida em {{vencimento}} (R$ {{valor}}). Podemos conversar sobre como regularizar?\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 25, 'psicanalise'),
  ('Psicanálise · 16 dias ou mais', 'pos_vencimento', 16, null,
   'Excelente dia, {{nome}}!\n\nA mensalidade {{parcela}} do curso de Psicanálise, vencida em {{vencimento}}, ainda aparece em aberto (R$ {{valor}}). Precisamos saber se você pretende continuar estudando e como podemos resolver essa pendência.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 26, 'psicanalise'),
  ('Psicanálise · promessa', 'promessa_vencida', 0, 0,
   'Excelente dia, {{nome}}!\n\nAnotamos sua previsão de pagamento da mensalidade {{parcela}} do curso de Psicanálise para hoje. Valor: R$ {{valor}}.\n\nLink da parcela: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 27, 'psicanalise'),
  ('Sociedade IDM · 3 dias antes', 'pre_vencimento', -3, -3,
   'Excelente dia, {{nome}}!\n\nLembramos que a contribuição {{parcela}} da Sociedade IDM, no valor de R$ {{valor}}, vence em {{vencimento}}.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 30, 'sociedade-idm'),
  ('Sociedade IDM · 1 dia antes', 'pre_vencimento', -1, -1,
   'Excelente dia, {{nome}}!\n\nAmanhã, {{vencimento}}, vence sua contribuição {{parcela}} da Sociedade IDM. Valor: R$ {{valor}}.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 31, 'sociedade-idm'),
  ('Sociedade IDM · vencimento', 'vencimento', 0, 0,
   'Excelente dia, {{nome}}!\n\nHoje vence sua contribuição {{parcela}} da Sociedade IDM ({{vencimento}}), no valor de R$ {{valor}}.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, desconsidere e nos envie o comprovante. Financeiro IDM.', true, 32, 'sociedade-idm'),
  ('Sociedade IDM · 1 a 3 dias', 'pos_vencimento', 1, 3,
   'Excelente dia, {{nome}}!\n\nAinda não identificamos a contribuição {{parcela}} da Sociedade IDM, vencida em {{vencimento}} (R$ {{valor}}). Segue o link para regularizar:\n{{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 33, 'sociedade-idm'),
  ('Sociedade IDM · 4 a 7 dias', 'pos_vencimento', 4, 7,
   'Excelente dia, {{nome}}!\n\nSua contribuição {{parcela}} da Sociedade IDM segue em aberto desde {{vencimento}} (R$ {{valor}}). Há alguma dificuldade em que possamos ajudar?\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 34, 'sociedade-idm'),
  ('Sociedade IDM · 8 a 15 dias', 'pos_vencimento', 8, 15,
   'Excelente dia, {{nome}}!\n\nPodemos alinhar a contribuição {{parcela}} da Sociedade IDM, vencida em {{vencimento}} (R$ {{valor}})? Precisamos de uma posição sua para organizar o financeiro.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 35, 'sociedade-idm'),
  ('Sociedade IDM · 16 dias ou mais', 'pos_vencimento', 16, null,
   'Excelente dia, {{nome}}!\n\nA contribuição {{parcela}} da Sociedade IDM, vencida em {{vencimento}}, ainda consta em aberto (R$ {{valor}}). Você pretende manter sua participação? Podemos conversar e encontrar a melhor forma de regularizar.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 36, 'sociedade-idm'),
  ('Sociedade IDM · promessa', 'promessa_vencida', 0, 0,
   'Excelente dia, {{nome}}!\n\nSua previsão de pagamento da contribuição {{parcela}} da Sociedade IDM foi anotada para hoje. Valor: R$ {{valor}}.\n\nLink da contribuição: {{link_pagamento}}\n\nSe já pagou, nos envie o comprovante. Financeiro IDM.', true, 37, 'sociedade-idm')
) as novos(nome, tipo, dias_offset, dias_offset_fim, mensagem, ativo, ordem, produto)
where not exists (
  select 1 from public.cobranca_templates t
  where t.produto = novos.produto and t.tipo = novos.tipo
    and t.dias_offset = novos.dias_offset
    and t.dias_offset_fim is not distinct from novos.dias_offset_fim
)
on conflict do nothing;
commit;
