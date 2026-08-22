-- Follow-up automático do SDR de IA (leads-ia-responder): quando o lead some no meio
-- da conversa (sem handoff, só silêncio), a IA manda até 3 cutucadas escalonadas antes
-- de desistir. E quando o lead JÁ está em handoff (aguardando_humano) e nenhum vendedor
-- respondeu manualmente por um tempo, manda um lembrete extra pro time (só uma vez).

ALTER TABLE public.leads_ia_conversas
  ADD COLUMN IF NOT EXISTS followup_proximo_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followups_enviados INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handoff_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS humano_assumiu_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lembrete_time_enviado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.leads_ia_conversas.followup_proximo_em IS
  'Quando a próxima cutucada automática deve disparar (null = nenhuma agendada). Setado pelo leads-ia-responder a cada turno e pelo leads-ia-followup a cada tentativa.';
COMMENT ON COLUMN public.leads_ia_conversas.followups_enviados IS
  'Quantas cutucadas de silêncio já foram mandadas na leva atual (reseta pra 0 sempre que o lead responde de novo). Máximo 3.';
COMMENT ON COLUMN public.leads_ia_conversas.handoff_em IS
  'Quando a conversa entrou em aguardando_humano pela última vez -- usado pra medir demora do time e disparar lembrete.';
COMMENT ON COLUMN public.leads_ia_conversas.humano_assumiu_em IS
  'Quando um humano respondeu manualmente pela primeira vez depois do handoff -- setado pelo evo-resposta (fromMe=true). Presença disso cancela o lembrete de demora.';
COMMENT ON COLUMN public.leads_ia_conversas.lembrete_time_enviado_em IS
  'Quando o lembrete de "handoff parado" foi mandado pro time -- só manda uma vez por handoff, não fica repetindo.';
