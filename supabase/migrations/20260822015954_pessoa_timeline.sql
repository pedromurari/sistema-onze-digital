-- Sprint 3e — A jornada de uma pessoa num lugar so.
--
-- E o que hoje nao existe: pra entender um contato, o funcionario precisa abrir Pipeline,
-- Time Comercial, Financeiro e o Chat, e cruzar na cabeca — quando lembra que a pessoa
-- existe nos quatro. A view junta os eventos que ja estao no banco, ligados pela pessoa.
--
-- `security_invoker` para respeitar a RLS de quem consulta: quem nao pode ver pagamento
-- nao ve o evento de pagamento na linha do tempo.

create or replace view public.pessoa_timeline
with (security_invoker = true)
as
  select l.pessoa_id, l.criado_em as quando, 'lead_criado' as tipo,
         coalesce('Entrou como lead' || coalesce(' — ' || l.origem, ''), 'Entrou como lead') as titulo,
         l.vendedor as detalhe, 'leads' as origem_tabela, l.id::text as origem_id
    from public.leads l
   where l.pessoa_id is not null

  union all
  select l.pessoa_id, h.criado_em, 'fase_mudou',
         'Fase: ' || coalesce(h.fase_anterior, '—') || ' -> ' || h.fase_nova,
         coalesce(h.vendedor, h.origem_mudanca), 'leads_historico_fase', h.id::text
    from public.leads_historico_fase h
    join public.leads l on l.id = h.lead_id
   where l.pessoa_id is not null

  union all
  select a.pessoa_id,
         coalesce(a.data_matricula::timestamptz, a.created_at), 'matricula',
         'Matriculado' || coalesce(' em ' || t.nome, ''),
         a.produto, 'alunos', a.id::text
    from public.alunos a
    left join public.turmas t on t.id = a.turma_id
   where a.pessoa_id is not null

  union all
  select a.pessoa_id, coalesce(p.data_pagamento::timestamptz, p.created_at), 'pagamento',
         'Pagamento de R$ ' || to_char(p.valor, 'FM999G999D00'),
         p.status, 'pagamentos', p.id::text
    from public.pagamentos p
    join public.alunos a on a.id = p.aluno_id
   where a.pessoa_id is not null
     and p.status in ('pago', 'confirmado')

  union all
  select pe.id, w.created_at, 'mensagem',
         case when w.direcao = 'entrada' then 'Mensagem recebida' else 'Mensagem enviada' end,
         left(w.conteudo, 140), 'whatsapp_mensagens', w.id::text
    from public.whatsapp_mensagens w
    join public.pessoas pe on pe.telefone = public.normalizar_telefone(w.telefone)

  union all
  select n.pessoa_id, n.created_at, 'evento_npa',
         'Inscrito no evento' || coalesce(' ' || e.nome, ''),
         n.fase, 'npa_evento_leads', n.id::text
    from public.npa_evento_leads n
    left join public.npa_eventos e on e.id = n.npa_evento_id
   where n.pessoa_id is not null;

comment on view public.pessoa_timeline is
  'Jornada completa de cada pessoa: lead, mudancas de fase, matricula, pagamentos, conversas e eventos. security_invoker: respeita a RLS de quem consulta.';

grant select on public.pessoa_timeline to authenticated;
