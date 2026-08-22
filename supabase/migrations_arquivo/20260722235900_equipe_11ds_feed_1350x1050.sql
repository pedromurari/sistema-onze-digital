-- Corrige o contrato final do feed: Instagram 1350x1050.
-- Mantemos a alternancia tipografico/fotografico e a identidade premium;
-- somente a tela do criativo volta ao tamanho usado antes do compositor 4K.

UPDATE public.equipe_11ds_blueprints
SET
  spec = jsonb_set(
    jsonb_set(spec, '{canvas}', '[1350,1050]'::jsonb, true),
    '{safe_area}', '80'::jsonb, true
  ),
  updated_at = now()
WHERE status = 'ativo';

COMMENT ON TABLE public.equipe_11ds_blueprints IS
  'Contratos visuais versionados da Equipe 11DS; o feed vigente usa canvas 1350x1050.';
