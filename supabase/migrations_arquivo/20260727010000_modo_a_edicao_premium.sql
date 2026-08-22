-- Modo A, padrao de edicao premium (ver docs/superpowers/specs/2026-07-26-modo-a-edicao-premium-design.md).
-- Ambas aditivas -- sem impacto em Modo B (own_footage) nem em jobs/scripts existentes.

-- Palavra-tese do roteiro (camada "Conceito" da legenda: dourado, italico serifado,
-- aparece no maximo 1 vez no video inteiro). Marcada pelo Roteirista.
alter table public.video_scripts add column if not exists concept_word text;

-- Faixa de musica de fundo sorteada pro job -- guardada na primeira vez que e'
-- escolhida (passo rendering, antes do 1o render-scene) pra retentativa nunca
-- trocar de faixa no meio do video.
alter table public.video_jobs add column if not exists music_track_url text;
