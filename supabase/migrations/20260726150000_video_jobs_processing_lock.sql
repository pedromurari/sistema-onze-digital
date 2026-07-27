-- Trava de processamento (lease) pro idm-video-processar. Sem isso, gerar 8
-- imagens/áudios sequenciais pode passar de 1 min (intervalo do cron) e um
-- segundo tick pega o MESMO job ainda no mesmo status, reprocessando os
-- blocos já feitos em paralelo -- foi exatamente o que aconteceu no primeiro
-- teste real do Modo A (rate limit da OpenAI batido por chamadas duplicadas).
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS processing_lock_at TIMESTAMPTZ;
