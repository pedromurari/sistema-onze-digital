-- Suporte a item "só por um dia" na Rotina do CEO, além dos itens
-- recorrentes diários de sempre. data_alvo null = aparece todo dia;
-- data_alvo preenchida = aparece só naquela data. Pedido do Pedro
-- 27/10/2026: 30min/dia pra Voomp (recorrente) + ajeitar acesso da
-- Jocimara Anjos (só amanhã, 28/10).

alter table public.ceo_rotina_itens add column if not exists data_alvo date;

update public.ceo_rotina_itens set ordem = 10 where departamento = 'marketing' and texto like 'Ver Diretoria Marketing%';
update public.ceo_rotina_itens set ordem = 11 where departamento = 'rh' and texto like 'Ver Diretoria RH%';

insert into public.ceo_rotina_itens (departamento, texto, ordem, data_alvo) values
  ('pedagogico', 'Voomp (Anhanguera): dar acesso e cobrar alunos pra acessarem a plataforma (aulas + certificado de extensão) — 30min', 8, null),
  ('pedagogico', 'Ajeitar o acesso da Jocimara Anjos na Voomp (coordenadora pedagógica)', 9, '2026-10-28');
