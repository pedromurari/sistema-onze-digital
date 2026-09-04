-- Adiciona 'pnl_manual' como origem_lead valida -- usado pelas matriculas
-- de PNL Practitioner/Master registradas manualmente pela Helen (venda
-- negociada por WhatsApp, cobranca por fora, ver pnl_matricula_criar).
ALTER TABLE public.alunos DROP CONSTRAINT alunos_origem_lead_check;
ALTER TABLE public.alunos ADD CONSTRAINT alunos_origem_lead_check
  CHECK (origem_lead = ANY (ARRAY['direto'::text, 'lancamento'::text, 'npa'::text, 'aula_secreta'::text, 'time_comercial'::text, 'pnl_manual'::text]));
