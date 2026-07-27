-- View unificada das fontes de lead com volume real (lancamento_leads, npa_evento_leads,
-- alunos, seu_numerologo_leads). As ~20 tabelas sheet_leads_NN (staging bruto de planilha,
-- já sincronizam pra lancamento_leads) e as tabelas quase vazias (franquia_leads,
-- idm_quiz_leads, aula_secreta_leads, sv_leads) ficam de fora por decisão explícita.
--
-- Achado 1: lancamento_leads.fase NÃO é um texto fixo ('planilha'/'oferta'/...) -- é o id
-- (como texto) de uma linha em kanban_colunas, que tem colunas customizáveis por
-- lançamento. O nome legível vem do JOIN com kanban_colunas.nome.
--
-- Achado 2 (segurança): seu_numerologo_leads não concede SELECT a anon/authenticated --
-- só service_role/postgres (só é tocada por edge function). A view roda como "definer"
-- (dono) de propósito pra poder ler essa fonte também, expondo só as colunas já
-- selecionadas aqui (não a tabela inteira, que tem dado de cálculo numerológico e
-- tracking de anúncio). Como a view roda como definer, o RLS das tabelas de origem NÃO
-- se aplica a quem consulta a view -- o grant explícito abaixo é o único portão, por isso
-- o REVOKE de anon é obrigatório (o schema public concede grant amplo por padrão a
-- qualquer objeto novo, incluindo anon).
DROP VIEW IF EXISTS public.leads_unificados;

CREATE VIEW public.leads_unificados AS
-- Lançamentos (Semana do Despertar)
SELECT
  'lancamento_leads'::text AS origem_tabela,
  ll.id AS origem_id,
  'Lançamento: ' || COALESCE(l.nome, '(sem lançamento)') AS origem,
  ll.nome,
  ll.whatsapp AS telefone,
  ll.email,
  COALESCE(kc.nome, '(sem fase)') AS fase,
  CASE
    WHEN kc.nome ILIKE '%matríc%' OR kc.nome ILIKE '%matric%' THEN 'quente'
    WHEN kc.nome ILIKE '%oferta%' OR kc.nome ILIKE '%negocia%' THEN 'morno'
    ELSE 'frio'
  END AS temperatura,
  COALESCE(ll.bv_enviado, false) AS bv_enviado,
  ll.created_at AS criado_em
FROM public.lancamento_leads ll
LEFT JOIN public.lancamentos l ON l.id = ll.lancamento_id
LEFT JOIN public.kanban_colunas kc ON kc.id = NULLIF(ll.fase, '')::uuid

UNION ALL

-- Eventos NPA (IDM Pelo Brasil)
SELECT
  'npa_evento_leads',
  nel.id,
  'Evento NPA: ' || COALESCE(ne.nome, '(sem evento)'),
  nel.nome,
  nel.whatsapp,
  nel.email,
  COALESCE(nel.fase, '(sem fase)'),
  CASE
    WHEN nel.fase = 'matricula' THEN 'quente'
    WHEN nel.fase IN ('ingresso_pago', 'confirmado', 'evento') THEN 'morno'
    ELSE 'frio'
  END,
  COALESCE(nel.bv_enviado, false),
  nel.created_at
FROM public.npa_evento_leads nel
LEFT JOIN public.npa_eventos ne ON ne.id = nel.npa_evento_id

UNION ALL

-- Alunos (matriculados)
SELECT
  'alunos',
  a.id,
  'Aluno: ' || COALESCE(t.nome, '(sem turma)'),
  a.nome,
  a.whatsapp,
  a.email,
  a.status,
  'quente',
  EXISTS (
    SELECT 1 FROM public.boas_vindas_logs bvl
    WHERE bvl.whatsapp = a.whatsapp AND bvl.wpp_status = 'sent'
  ),
  a.created_at
FROM public.alunos a
LEFT JOIN public.turmas t ON t.id = a.turma_id

UNION ALL

-- Numerólogo
SELECT
  'seu_numerologo_leads',
  snl.id,
  'Numerólogo',
  snl.nome,
  snl.whatsapp,
  snl.email,
  CASE
    WHEN snl.pago_at IS NOT NULL THEN 'comprou'
    WHEN snl.comprou_at IS NOT NULL THEN 'comprando'
    WHEN snl.calculou_at IS NOT NULL THEN 'calculou'
    ELSE 'novo'
  END,
  CASE
    WHEN snl.pago_at IS NOT NULL THEN 'quente'
    WHEN snl.comprou_at IS NOT NULL OR snl.calculou_at IS NOT NULL THEN 'morno'
    ELSE 'frio'
  END,
  EXISTS (
    SELECT 1 FROM public.boas_vindas_logs bvl
    WHERE bvl.whatsapp = snl.whatsapp AND bvl.wpp_status = 'sent'
  ),
  snl.created_at
FROM public.seu_numerologo_leads snl;

REVOKE ALL ON public.leads_unificados FROM anon;
REVOKE ALL ON public.leads_unificados FROM authenticated;
GRANT SELECT ON public.leads_unificados TO authenticated;
