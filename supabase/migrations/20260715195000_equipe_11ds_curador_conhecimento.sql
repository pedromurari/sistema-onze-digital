-- Sexto papel do time de midia: Curador de Conhecimento. Roda como ultimo passo
-- da cadeia (depois do QA do Gestor) e decide, com uma regua alta, se algo do
-- dia merece virar aprendizado permanente sobre o cliente no cofre Obsidian
-- (repo 11ds-conhecimento). Na maioria dos dias ele nao escreve nada -- isso e'
-- esperado, nao uma falha.

INSERT INTO equipe_11ds_agentes (time_id, nome, cargo, slug, ordem, status)
SELECT (SELECT id FROM equipe_11ds_times WHERE slug = 'posts-criativos'), 'Curador', 'Curador de Conhecimento', 'curador-conhecimento', 5, 'livre'
WHERE NOT EXISTS (SELECT 1 FROM equipe_11ds_agentes WHERE slug = 'curador-conhecimento');
