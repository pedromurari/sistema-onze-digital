ALTER TABLE conteudo_clientes ADD COLUMN IF NOT EXISTS instagram_handle text;
UPDATE conteudo_clientes SET instagram_handle = '@institutodespertamente' WHERE id = 'cdb9037a-2303-4155-aac6-fda9cac36f75';
