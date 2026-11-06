-- ped_avaliacoes/ped_questoes já existiam (descobertos 06/11/2026 ao
-- construir o editor de Provas e Trabalhos -- havia um piloto real de 5
-- questões discursivas sobre Fundamentos da Psicanálise, inserido direto
-- no banco, sem nenhuma tela de edição). ped_questoes.tipo já aceita
-- 'objetiva', mas não existia onde guardar as opções nem qual é a
-- correta -- só resposta_esperada/criterios_correcao, que fazem sentido
-- pra discursiva/envio_trabalho. Adiciona as duas colunas sem tocar nas
-- 10 questões discursivas já existentes.

alter table public.ped_questoes add column if not exists opcoes jsonb;
alter table public.ped_questoes add column if not exists resposta_correta text;
