-- F2: URL da foto de grupo gerada por DALL-E, persistida no Storage

ALTER TABLE lancamentos   ADD COLUMN IF NOT EXISTS foto_grupo_url text;
ALTER TABLE npa_eventos    ADD COLUMN IF NOT EXISTS foto_grupo_url text;

-- Bucket 'fotos-grupo' deve ser criado no Supabase Dashboard (Storage → New bucket)
-- com visibilidade pública
