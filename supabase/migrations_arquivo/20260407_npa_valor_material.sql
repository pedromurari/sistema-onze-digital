-- Adiciona valor padrão de material por evento
ALTER TABLE public.npa_eventos
  ADD COLUMN IF NOT EXISTS valor_material_padrao numeric DEFAULT 97;
