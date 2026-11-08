-- Pedido do Pedro (08/11/2026): pedir aos 7 terapeutas já aprovados os
-- dias/horários disponíveis esse mês, por WhatsApp, um de cada vez com
-- bastante intervalo entre os envios (não é pra disparar tudo de uma vez).
alter table public.diva_terapeutas
  add column if not exists disponibilidade_solicitada_em timestamptz;

comment on column public.diva_terapeutas.disponibilidade_solicitada_em is 'Quando mandamos a mensagem pedindo disponibilidade do mês por WhatsApp -- null = ainda não pedimos.';
