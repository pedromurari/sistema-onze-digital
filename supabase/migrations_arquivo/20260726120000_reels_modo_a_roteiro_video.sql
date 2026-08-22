-- Modo A do Reels IDM: time "Roteiro & Vídeo" (Estrategista de Viral ->
-- Roteirista -> Gestor de Vídeo) + aprovação manual do roteiro antes de
-- gastar com narração/imagem/render. Aditivo, não altera o Modo B.

-- ── video_scripts: liga ao cliente (pra logo/tom de voz) e ao fluxo de aprovação ──
ALTER TABLE public.video_scripts
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.conteudo_clientes(id),
  ADD COLUMN IF NOT EXISTS aprovado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tarefa_id UUID REFERENCES public.equipe_11ds_tarefas(id);

DROP POLICY IF EXISTS "Authenticated users can update video_scripts" ON public.video_scripts;
CREATE POLICY "Authenticated users can update video_scripts" ON public.video_scripts FOR UPDATE TO authenticated USING (true);

-- ── equipe_11ds_tarefas: novo tipo + status de espera pela aprovação humana ──
ALTER TABLE public.equipe_11ds_tarefas DROP CONSTRAINT IF EXISTS equipe_11ds_tarefas_tipo_check;
ALTER TABLE public.equipe_11ds_tarefas ADD CONSTRAINT equipe_11ds_tarefas_tipo_check
  CHECK (tipo IN ('post_cliente', 'avulso', 'video_roteiro'));

ALTER TABLE public.equipe_11ds_tarefas DROP CONSTRAINT IF EXISTS equipe_11ds_tarefas_status_check;
ALTER TABLE public.equipe_11ds_tarefas ADD CONSTRAINT equipe_11ds_tarefas_status_check
  CHECK (status IN ('pendente', 'em_andamento', 'aguardando_aprovacao', 'concluido', 'erro'));

-- ── Novo time + 3 agentes, mesmo padrão dos times existentes ──────────────────
INSERT INTO public.equipe_11ds_times (nome, slug, emoji, ordem)
VALUES ('Roteiro & Vídeo', 'roteiro-video', '🎬', 3)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_time_id UUID;
BEGIN
  SELECT id INTO v_time_id FROM public.equipe_11ds_times WHERE nome = 'Roteiro & Vídeo' LIMIT 1;

  INSERT INTO public.equipe_11ds_agentes (time_id, nome, cargo, slug, executor_function, ordem, status, responsabilidade, regras, aplica)
  VALUES
    (
      v_time_id, 'Estrategista de Viral', 'Estrategista de Viral', 'estrategista-viral', 'equipe-11ds-roteiro-executar', 0, 'livre',
      'Recebe o tema pedido e define o gancho dos primeiros segundos, o ângulo emocional/gatilho psicológico e a estrutura de retenção (hook → desenvolvimento → payoff/CTA) pensando em TikTok e Reels.',
      ARRAY[
        'Nunca depende de depoimento real de aluno, prova social inexistente no sistema ou cobertura de evento que de fato aconteceu -- só ideia, reflexão, reframe, mito x verdade ou mecanismo 100% produzível do zero.',
        'O gancho precisa travar o scroll nos primeiros segundos -- nunca abre devagar ou com contexto institucional.'
      ],
      ARRAY['Estrutura hook -> desenvolvimento -> payoff/CTA', 'Gatilhos psicológicos de retenção de vídeo curto']
    ),
    (
      v_time_id, 'Roteirista', 'Roteirista', 'roteirista-video', 'equipe-11ds-roteiro-executar', 1, 'livre',
      'Escreve o texto completo da narração (com o gancho do Estrategista embutido) e divide em blocos de cena, cada um com o texto falado e o prompt de imagem daquela cena.',
      ARRAY[
        'Nunca escreve texto/letras/logo na descrição da imagem de cena -- a imagem é só fotografia, texto nunca aparece dentro dela.',
        'Cada bloco de cena precisa ter texto e prompt de imagem preenchidos -- nunca entrega bloco incompleto.'
      ],
      ARRAY['Blocos de cena com prompt de imagem por bloco', 'Regra de proibição fotográfica da Nina (sem texto/marca-d''água na imagem-base)']
    ),
    (
      v_time_id, 'Gestor de Vídeo', 'Gestor de Vídeo', 'gestor-video', 'equipe-11ds-roteiro-executar', 2, 'livre',
      'Faz o QA final do roteiro (coerência, tom de marca, regra de replicabilidade) antes de deixar esperando sua aprovação -- nunca manda pra narração/imagem/render sem essa checagem.',
      ARRAY['Nunca aprova um roteiro que quebre a regra de replicabilidade herdada do Estrategista.'],
      ARRAY['QA de coerência e tom de marca antes da aprovação humana']
    )
  ON CONFLICT DO NOTHING;
END $$;
