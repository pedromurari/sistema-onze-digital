-- Campos do template de storytelling: saudação e professor convidado
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS slogan text DEFAULT 'Excelente',
  ADD COLUMN IF NOT EXISTS professor_convidado text;

ALTER TABLE npa_eventos
  ADD COLUMN IF NOT EXISTS slogan text DEFAULT 'Excelente',
  ADD COLUMN IF NOT EXISTS professor_convidado text;
