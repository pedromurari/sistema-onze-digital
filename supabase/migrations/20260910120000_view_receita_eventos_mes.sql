-- Receita dos eventos NPA / IDM pelo Brasil, agregada por mês de competência.
--
-- POR QUE: o DRE (DreCompetencia) só enxergava receita que passa por `pagamentos`
-- (mensalidades) ou lançada à mão em `balanco_itens`. A receita dos eventos
-- presenciais mora em `npa_evento_leads` (ingresso pago, material comprado,
-- matrícula fechada no evento) e nunca entrava — em agosto/2026 isso escondeu
-- ~R$ 17,8 mil e fez o mês parecer negativo. Esta view deixa o DRE ler essa
-- receita direto da fonte, sempre atualizada, sem lançamento manual por evento.
--
-- COMPETÊNCIA: mês de `npa_eventos.data_evento` (o evento acontece num dia só).
-- `valor_ingresso` é unitário por lead; multiplica-se por `ingressos_comprados`
-- (um lead pode levar acompanhante). `valor_material` e `valor_matricula` já são
-- o total daquele lead.
--
-- CUIDADO com dupla contagem: se um matriculado do evento virar aluno e ganhar
-- parcelas em `pagamentos` na MESMA competência, some duas vezes. Na prática a
-- 1ª parcela mensal do aluno cai no mês seguinte, então não colide — mas se
-- mudar, revisar aqui.

create or replace view public.vw_receita_eventos_mes as
select
  to_char(e.data_evento, 'YYYY-MM')                                   as mes,
  e.id                                                                as evento_id,
  e.nome                                                              as evento,
  e.data_evento                                                       as data_evento,
  e.status                                                            as status,
  coalesce(sum(coalesce(l.ingressos_comprados, 1) * l.valor_ingresso)
             filter (where l.ingresso_pago), 0)                       as receita_ingressos,
  coalesce(sum(l.valor_material) filter (where l.comprou_material), 0) as receita_material,
  coalesce(sum(l.valor_matricula) filter (where l.matriculado), 0)    as receita_matriculas,
  coalesce(sum(coalesce(l.ingressos_comprados, 1) * l.valor_ingresso)
             filter (where l.ingresso_pago), 0)
    + coalesce(sum(l.valor_material) filter (where l.comprou_material), 0)
    + coalesce(sum(l.valor_matricula) filter (where l.matriculado), 0) as receita_total,
  count(*) filter (where l.ingresso_pago)                             as qtd_pagantes,
  count(*) filter (where l.matriculado)                               as qtd_matriculas
from public.npa_eventos e
left join public.npa_evento_leads l on l.npa_evento_id = e.id
where e.data_evento is not null
group by e.id, e.nome, e.data_evento, e.status;

comment on view public.vw_receita_eventos_mes is
  'Receita de eventos NPA/IDM pelo Brasil por mês (data_evento). Fonte do bloco "Eventos" do DRE. Ver migration 20260910120000.';

grant select on public.vw_receita_eventos_mes to authenticated;
