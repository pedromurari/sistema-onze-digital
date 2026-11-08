-- UTM do link rastreavel de divulgacao (aba Trafego do CRM onze-digital-main)
-- pra saber de qual parceira/campanha veio cada lead.

ALTER TABLE leads_cicatrizes
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text;
