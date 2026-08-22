ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS boas_vindas text,
ADD COLUMN IF NOT EXISTS tempo_interesse text,
ADD COLUMN IF NOT EXISTS objetivo_principal text,
ADD COLUMN IF NOT EXISTS engajamento text,
ADD COLUMN IF NOT EXISTS followup_01 text,
ADD COLUMN IF NOT EXISTS followup_02 text,
ADD COLUMN IF NOT EXISTS followup_03 text,
ADD COLUMN IF NOT EXISTS closser text,
ADD COLUMN IF NOT EXISTS ultima_mensagem text,
ADD COLUMN IF NOT EXISTS link_de_pagamento_enviado text,
ADD COLUMN IF NOT EXISTS mensagem_lead text,
ADD COLUMN IF NOT EXISTS mensagem_ia text;

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;