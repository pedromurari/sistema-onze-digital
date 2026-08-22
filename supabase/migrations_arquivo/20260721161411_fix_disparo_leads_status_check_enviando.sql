ALTER TABLE disparo_leads DROP CONSTRAINT disparo_leads_status_check;
ALTER TABLE disparo_leads ADD CONSTRAINT disparo_leads_status_check
  CHECK (status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviado'::text, 'erro'::text, 'pulado'::text]));
