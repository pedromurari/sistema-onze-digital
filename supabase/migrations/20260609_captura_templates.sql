-- F1: Templates de página de captura editáveis no banco

CREATE TABLE IF NOT EXISTS captura_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto     text NOT NULL,
  titulo      text NOT NULL,
  subtitulo   text,
  cta_texto   text DEFAULT 'Quero participar',
  html_extra  text,                   -- bloco HTML livre (depoimentos, garantia, etc.)
  cor_primaria text DEFAULT '#7C3AED',
  ativo       boolean DEFAULT true,
  criado_em   timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_captura_templates_produto
  ON captura_templates (produto)
  WHERE ativo = true;

-- Template padrão para psicanálise
INSERT INTO captura_templates (produto, titulo, subtitulo, cta_texto, cor_primaria)
VALUES (
  'psicanalise',
  'Formação em Psicanálise Clínica',
  'Aprenda na prática. Transforme vidas — inclusive a sua.',
  'Quero me inscrever agora',
  '#7C3AED'
) ON CONFLICT DO NOTHING;
