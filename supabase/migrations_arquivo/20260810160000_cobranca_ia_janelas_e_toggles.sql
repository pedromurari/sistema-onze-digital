-- Evolução do agente de IA de cobrança: motivo de handoff dedicado pra cancelamento,
-- template novo pro dia da promessa de pagamento, e toggle por aluno pra permitir (ou
-- não) a IA responder -- independente do toggle de cobrança automática que já existe
-- (alunos.cobranca_ativa). Ver docs/superpowers/specs/2026-08-10-cobranca-ia-fluxo-completo-design.md.

-- ── Toggle "Resposta da IA" por aluno ────────────────────────────────────────────────
-- Default TRUE pra preservar o comportamento atual (a IA já responde por qualquer
-- aluno com log de cobrança, sem esse filtro).
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS cobranca_ia_ativa BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Motivo de handoff dedicado pra pedido de cancelamento ───────────────────────────
-- Antes caía em 'fora_de_escopo' (genérico); separado agora pra facilitar priorizar
-- esses casos (mais sensíveis) na revisão humana da aba Conversas IA.
ALTER TABLE public.cobranca_ia_conversas DROP CONSTRAINT IF EXISTS cobranca_ia_conversas_motivo_handoff_check;
ALTER TABLE public.cobranca_ia_conversas
  ADD CONSTRAINT cobranca_ia_conversas_motivo_handoff_check
  CHECK (motivo_handoff IS NULL OR motivo_handoff IN
    ('dado_coletado', 'fora_de_escopo', 'pedido_negociacao', 'reclamacao',
     'baixa_confianca', 'erro_ia', 'limite_turnos', 'pedido_cancelamento'));

-- ── Template novo: dia da promessa de pagamento ─────────────────────────────────────
-- Disparado pelo tique automático (enviar-cobranca) quando pagamentos.data_prevista_pagamento
-- de uma parcela == hoje, com prioridade sobre a fase normal por dias de atraso.
ALTER TABLE public.cobranca_templates DROP CONSTRAINT IF EXISTS cobranca_templates_tipo_check;
ALTER TABLE public.cobranca_templates
  ADD CONSTRAINT cobranca_templates_tipo_check
  CHECK (tipo IN ('pre_vencimento', 'vencimento', 'pos_vencimento', 'quitacao', 'aviso_cancelamento', 'promessa_vencida'));

INSERT INTO public.cobranca_templates (nome, tipo, dias_offset, mensagem, ativo, ordem)
SELECT
  'Promessa de pagamento',
  'promessa_vencida',
  0,
  'Oi {{nome}}! 👋

Hoje é o dia que você combinou de pagar a parcela {{parcela}} (R$ {{valor}}).

{{#link_pagamento}}Segue o link, é o mesmo de sempre:
{{link_pagamento}}{{/link_pagamento}}

Qualquer dúvida, é só chamar por aqui! 😊',
  true,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.cobranca_templates WHERE tipo = 'promessa_vencida'
);

-- ── get_alunos_para_cobranca expõe cobranca_ia_ativa ────────────────────────────────
-- Não entra no WHERE (diferente de cobranca_ativa) -- o aluno continua na fila mesmo
-- com a IA desligada, é só informativo pro toggle na tela.
DROP FUNCTION IF EXISTS public.get_alunos_para_cobranca(DATE);

CREATE FUNCTION public.get_alunos_para_cobranca(p_data DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  aluno_id                UUID,
  aluno_nome              TEXT,
  telefone                TEXT,
  pagamento_id            UUID,
  valor                   NUMERIC,
  parcela                 INTEGER,
  data_vencimento         DATE,
  dias_offset             INTEGER,
  link_pagamento          TEXT,
  pagamento_status        TEXT,
  data_prevista_pagamento DATE,
  cobranca_ia_ativa       BOOLEAN
) LANGUAGE sql STABLE AS $$
  SELECT
    a.id            AS aluno_id,
    a.nome          AS aluno_nome,
    COALESCE(a.cobranca_telefone, a.whatsapp) AS telefone,
    p.id            AS pagamento_id,
    p.valor,
    p.numero_parcela AS parcela,
    p.data_vencimento,
    (p_data - p.data_vencimento)::INTEGER AS dias_offset,
    COALESCE(a.asaas_link, a.voomp_link, '') AS link_pagamento,
    p.status        AS pagamento_status,
    p.data_prevista_pagamento,
    a.cobranca_ia_ativa
  FROM public.pagamentos p
  JOIN public.alunos     a   ON a.id = p.aluno_id
  JOIN public.cobranca_turmas_ativas cta ON cta.turma_id = a.turma_id
  WHERE
    a.status NOT IN ('cancelado', 'concluido')
    AND a.cobranca_ativa = TRUE
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
