-- O SDR de IA de leads (leads-ia-responder/leads-ia-followup) mandava mensagem de
-- verdade via Evolution mas só logava em leads_ia_mensagens (histórico interno da
-- IA) -- nunca em whatsapp_mensagens, que é a tabela que alimenta a aba Chat e o
-- mini-chat do CRM. Resultado: a conversa aparecia só com o lado do lead, nunca
-- com as respostas da IA. Adiciona 'leads_ia' como origem válida.

ALTER TABLE public.whatsapp_mensagens DROP CONSTRAINT IF EXISTS whatsapp_mensagens_origem_check;
ALTER TABLE public.whatsapp_mensagens
  ADD CONSTRAINT whatsapp_mensagens_origem_check
  CHECK (origem IN ('inbound', 'disparo', 'boas_vindas', 'cobranca', 'funil', 'manual', 'leads_ia'));
