-- Equipe de midia deixa de ser "so a Nina faz tudo" e vira um time de verdade:
-- Gestor (coordena, abre o dia, faz QA final), Estrategista (pauta/angulo),
-- Redator-chefe (legenda), Diretor de Arte (conceito visual), Nina (produção,
-- quem executa as ferramentas). `slug` e' necessario porque equipe-11ds-diario
-- atribuia a tarefa diaria ao "primeiro agente por ordem" -- com 5 agentes isso
-- quebra; agora o lookup e' por slug, estavel independente de reordenar o grid.

ALTER TABLE equipe_11ds_agentes ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE equipe_11ds_agentes
SET slug = 'nina-producao', cargo = 'Produção Visual', ordem = 4
WHERE id = '8ad25eeb-de7d-4660-b0cb-6cf8409a9215';

INSERT INTO equipe_11ds_agentes (time_id, nome, cargo, slug, ordem, status)
SELECT time_id, nome, cargo, slug, ordem, 'livre'
FROM (
  SELECT
    (SELECT id FROM equipe_11ds_times WHERE slug = 'posts-criativos') AS time_id,
    v.nome, v.cargo, v.slug, v.ordem
  FROM (VALUES
    ('Gestor', 'Gestor de Mídia', 'gestor-midia', 0),
    ('Estrategista', 'Estrategista de Conteúdo', 'estrategista-conteudo', 1),
    ('Redator', 'Redator-chefe', 'redator-chefe', 2),
    ('Diretor de Arte', 'Diretor de Arte', 'diretor-arte', 3)
  ) AS v(nome, cargo, slug, ordem)
) AS novos
WHERE NOT EXISTS (SELECT 1 FROM equipe_11ds_agentes WHERE slug = novos.slug);

CREATE UNIQUE INDEX IF NOT EXISTS equipe_11ds_agentes_slug_key ON equipe_11ds_agentes (slug) WHERE slug IS NOT NULL;
