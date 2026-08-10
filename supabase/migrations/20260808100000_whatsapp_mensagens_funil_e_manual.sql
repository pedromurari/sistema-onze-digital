-- Dois gaps encontrados na aba Chat (whatsapp_mensagens):
--
-- 1) funil-processar manda mensagem individual (recipient_type = 'number' em
--    funnel_messages, e o bloco de boas-vindas agendadas) e nunca gravava o
--    envio -- só as outras 3 funções (disparo-runner, boas-vindas-enviar,
--    enviar-cobranca) gravavam. Precisa de origem nova: os 4 valores
--    existentes não descrevem mensagem de funil de lançamento/NPA enviada
--    direto pro número do lead.
--
-- 2) evo-resposta descartava TODO evento fromMe=true ("if (fromMe) return
--    skip"), pra não duplicar o que as 4 funções de envio já gravam direto.
--    Efeito colateral: mensagem mandada NA MÃO pelo número conectado
--    (WhatsApp Web/app, fora do sistema) nunca aparecia no Chat -- nenhuma
--    das 4 funções roda pra esse caso, só o webhook veria. Fix: evo-resposta
--    passa a gravar TODO fromMe=true também (como 'enviada', origem
--    'manual'), usando evolution_message_id pra não duplicar o que uma das
--    4 funções já gravou (o echo do envio via API chega no mesmo webhook).

ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS evolution_message_id TEXT;

-- Unicidade só quando preenchido -- mensagem antiga (antes desse campo
-- existir) ou de origem sem id capturado fica com NULL, sem conflito.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_mensagens_evolution_message_id
  ON public.whatsapp_mensagens (evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_mensagens DROP CONSTRAINT IF EXISTS whatsapp_mensagens_origem_check;

ALTER TABLE public.whatsapp_mensagens
  ADD CONSTRAINT whatsapp_mensagens_origem_check
  CHECK (origem IN ('inbound', 'disparo', 'boas_vindas', 'cobranca', 'funil', 'manual'));
