ALTER TABLE conteudo_posts
  ADD COLUMN IF NOT EXISTS formato text CHECK (formato IN ('tipografico','fotografico')),
  ADD COLUMN IF NOT EXISTS reaproveitavel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vezes_reaproveitado int NOT NULL DEFAULT 0;

-- Backfill: infere formato dos posts existentes pelo arquetipo_visual
UPDATE conteudo_posts SET formato = 'tipografico' WHERE formato IS NULL AND arquetipo_visual ILIKE '%cartao%';
UPDATE conteudo_posts SET formato = 'fotografico' WHERE formato IS NULL;

-- Marca as 2 key arts novas do usuário como reaproveitáveis (seed do pool)
UPDATE conteudo_posts SET reaproveitavel = true
WHERE id IN ('57961196-d5fa-4abf-b573-a29af5dfe2d2', '54c3d9f7-8ba4-4a9d-bef5-284ec3d934fa');
