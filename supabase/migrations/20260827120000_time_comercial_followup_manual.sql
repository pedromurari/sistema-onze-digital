-- Follow-up manual do Time Comercial (etapa nova do funil, diferente do
-- sistema de sequência automática por WhatsApp que já existe via
-- followup_sequencia_id/followup_passo_atual). Aqui é o vendedor controlando
-- na mão: marca um prazo de retorno, o sistema conta quantas vezes ele já
-- tentou, mostra cronômetro no card e sugere (sem forçar) mover pra
-- "Aquecimento de Conteúdo" depois de algumas tentativas sem avançar.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS followup_manual_prazo date,
  ADD COLUMN IF NOT EXISTS followup_manual_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_manual_ultima_em timestamptz;

COMMENT ON COLUMN public.leads.followup_manual_prazo IS 'Data que o vendedor marcou pra voltar nesse lead (etapa "followup" do funil do Time Comercial) -- controla o cronômetro exibido no card.';
COMMENT ON COLUMN public.leads.followup_manual_tentativas IS 'Quantas vezes o vendedor já marcou um novo prazo de follow-up pra esse lead -- depois de 3, o sistema sugere mover pra "Aquecimento de Conteúdo".';
COMMENT ON COLUMN public.leads.followup_manual_ultima_em IS 'Timestamp da última vez que o vendedor marcou/renovou o follow-up manual -- usado só pra exibição, não pro cálculo do cronômetro (que usa followup_manual_prazo).';
