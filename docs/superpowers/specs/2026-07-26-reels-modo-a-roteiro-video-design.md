# Reels IDM — Modo A (roteiro → narração IA → Ken Burns)

## Objetivo

Completar o pipeline de Reels IDM com o modo que ainda não existia: gerar um vídeo do zero a partir de um tema, sem depender de gravação própria. O Modo B (editar vídeo próprio) já está em produção e não muda.

## Contexto

- Modo B já roda: `ReelsIDM.tsx`, edge function `idm-video-processar`, tabelas `video_scripts`/`video_jobs`/`video_assets`, worker ffmpeg em `equipe-11ds-video.vercel.app`.
- O enum de status de `video_jobs` (`queued → generating_audio → transcribing → generating_scenes → rendering → ready_for_review → failed`) já antecipa o Modo A e não precisa mudar.
- A Equipe 11DS já tem o padrão de time multi-agente (Posts & Criativos, Financeiro, Operações), ficha de cargo (`responsabilidade`/`regras`/`aplica`), e cadeia de agentes numa única edge function (`equipe-11ds-executar`).
- `conteudo_clientes` já guarda `logo_url`, tom de voz e `cta_padrao` por cliente; hoje só Instituto Despertamente está ativo.
- Nunca publica sozinho — o vídeo final sempre para em `ready_for_review` pra revisão manual, igual ao Modo B.

## Time "Roteiro & Vídeo"

Novo 4º time na Equipe 11DS, 3 agentes:

1. **Estrategista de Viral** — recebe o tema digitado pelo usuário e define o gancho dos primeiros segundos, o ângulo emocional/gatilho e a estrutura de retenção (hook → desenvolvimento → payoff/CTA), pensando em TikTok/Reels. Herda a regra dura de replicabilidade já usada pela mídia: nunca depende de depoimento real, prova social inexistente ou evento que de fato aconteceu.
2. **Roteirista** — escreve `full_narration_text` completo com o gancho embutido, divide em blocos de cena (`order`, `text`, `cut_type`, `image_prompt`, `movement_type`, `emphasis`). Como não há Diretor de Arte separado, o próprio Roteirista escreve o `image_prompt` de cada bloco, seguindo a mesma proibição fotográfica da Nina (nunca texto/logo/marca-d'água dentro da imagem gerada).
3. **Gestor de Vídeo** — abre a tarefa, faz QA do roteiro (coerência, tom de marca, regra de replicabilidade) e fica associado ao card enquanto espera aprovação.

Cada agente ganha ficha de cargo (`responsabilidade`/`regras`/`aplica`) preenchida manualmente, mesmo padrão dos times existentes.

## Fluxo de aprovação

1. Usuário digita um tema no card "Gerar vídeo por IA" (`ReelsIDM.tsx`).
2. `equipe-11ds-roteiro-executar` roda a cadeia Estrategista → Roteirista → Gestor de Vídeo (mensagens visíveis na esteira, mesmo padrão do `equipe-11ds-executar`).
3. Grava `video_scripts` com `aprovado = false`, `cliente_id` = cliente ativo, `tarefa_id` apontando pra tarefa criada.
4. Tarefa fica com `status = 'aguardando_aprovacao'` — aparece com o texto completo e a lista de cenas, com dois botões: "Aprovar e gerar vídeo" e "Pedir ajuste" (campo de texto curto).
5. "Pedir ajuste" volta a tarefa pra `em_andamento` e re-executa o Roteirista com o feedback anexado — sem geração de mídia envolvida, não precisa de proteção contra loop.
6. "Aprovar e gerar vídeo" marca `video_scripts.aprovado = true`, cria `video_jobs` (`mode = 'ai_generated'`, `script_id`, `status = 'queued'`) e marca a tarefa `concluido`. Só a partir daqui o sistema começa a gastar com narração, imagem e render.

## Geração técnica: narração, timing e cenas

Diferente de gerar um áudio único e tentar casar blocos de cena com trechos dele (impreciso), a narração é gerada **por bloco**:

1. Pra cada bloco, chama TTS (OpenAI) só com o texto daquele bloco — duração exata conhecida, sem estimativa.
2. Roda Whisper (word timestamps) em cada áudio de bloco individualmente.
3. Concatena os áudios dos blocos, na ordem, formando a narração final; desloca os timestamps de cada bloco pelo acumulado dos blocos anteriores.
4. Cada bloco já tem sua janela exata `[início, fim]` na timeline final, sem heurística de casamento texto↔áudio.
5. Pra cada bloco, gera a imagem de cena via `gpt-image-1.5` usando o `image_prompt` escrito pelo Roteirista.

## Montagem de vídeo (Ken Burns + logo)

- Novo endpoint `/api/render-scenes` no worker Vercel já existente (`equipe-11ds-video`) — reaproveita ffmpeg, autenticação (`WORKER_SECRET`) e deploy já prontos, sem criar serviço novo.
- Recebe: lista de cenas (`imagem`, janela de tempo exata, `movement_type`), narração concatenada, palavras com timestamp, logo do cliente.
- Monta o vídeo Ken Burns (cada imagem com zoom/pan preenchendo a duração exata do bloco) e reaproveita a mesma função de acabamento que o Modo B já usa (grade de cor, vinheta, grain, legenda karaokê via `.ass`).
- Essa função de acabamento ganha um passo novo: overlay de logo semi-transparente, num canto, do início ao fim do vídeo.
- A logo vem do `cliente_id` do `video_script` (Modo A). Como hoje só existe um cliente ativo, o Modo B (que não tem `cliente_id`) passa a usar como padrão a logo do cliente ativo — sem mudar a tela de upload do Modo B. Se no futuro houver mais de um cliente ativo simultaneamente, o Modo B precisará de uma forma explícita de escolher a logo; isso fica fora de escopo aqui.

## Máquina de estados (`video_jobs`, mode = 'ai_generated')

Reaproveita o enum de status existente, sem alteração de schema em `video_jobs`:

- `queued` → criado só após aprovação do roteiro.
- `generating_audio` → TTS por bloco + concatenação. Guarda em `video_assets` (`asset_type = 'narration_audio'`): uma linha por bloco (`block_order` = índice do bloco) e uma linha final concatenada (`block_order = null`).
- `transcribing` → Whisper por bloco de áudio, timestamps deslocados pelo acumulado. Guarda um único `video_assets` (`asset_type = 'transcript_json'`, `block_order = null`) com a lista completa de palavras já na timeline final — mesmo formato que o Modo B já usa no passo de render.
- `generating_scenes` → `gpt-image-1.5` por bloco, guarda como `video_assets` (`asset_type = 'scene_image'`, `block_order` preenchido).
- `rendering` → chama `/api/render-scenes` no worker.
- `ready_for_review` → igual ao Modo B, nunca publica sozinho.
- `failed` (em qualquer passo) → grava `error_message`, mesmo padrão do Modo B.

## Mudanças de schema

Todas aditivas:

- `equipe_11ds_times`: nova linha "Roteiro & Vídeo".
- `equipe_11ds_agentes`: 3 linhas novas com ficha de cargo preenchida.
- `equipe_11ds_tarefas`: `tipo_check` ganha `'video_roteiro'`; `status_check` ganha `'aguardando_aprovacao'`. `dados` guarda formato próprio (`tema`, `gancho`, `blocos`, `video_script_id`) — `TarefaDetalhe` ganha branch dedicado, checando o formato antes de renderizar (mesma cautela já aplicada pro formato da Bia).
- `video_scripts`: ganha `cliente_id` (FK `conteudo_clientes`), `aprovado boolean default false`, `tarefa_id` (FK `equipe_11ds_tarefas`).
- `video_jobs` / `video_assets`: sem mudança.

## Edge functions e worker

- Nova `equipe-11ds-roteiro-executar`: cadeia Estrategista → Roteirista → Gestor de Vídeo, grava `video_scripts` e marca tarefa `aguardando_aprovacao`.
- `idm-video-processar` (existente): ganha os passos pro `mode = 'ai_generated'` ao lado do que já processa pro Modo B (`mode = 'own_footage'`) — mesmo modelo de "1 job por tick" via cron.
- Worker `equipe-11ds-video`: novo endpoint `/api/render-scenes`; função de acabamento (`lib/pipeline.ts`) ganha parâmetro de logo, compartilhada entre os dois modos.

## UI

- `Equipe11ds.tsx`: card do novo time, ficha de cargo dos 3 agentes, histórico de decisões (reaproveita `HistoricoDecisoes` já existente). Tarefa `aguardando_aprovacao` mostra texto completo + lista de cenas com os botões de aprovar/pedir ajuste.
- `ReelsIDM.tsx`: novo card "Gerar vídeo por IA" com campo de tema, ao lado do card já existente "Editar meu vídeo".

## Tratamento de erros

Cada passo do job (áudio, transcrição, imagem, render) marca `failed` + `error_message`, reaproveitando o padrão já usado no Modo B — sem try/catch novo.

## Validação

Depois de implementado, rodar de ponta a ponta com um tema real: acompanhar os 3 agentes escrevendo o roteiro, aprovar, acompanhar o job até `ready_for_review`, e checar o vídeo final (Ken Burns, legenda karaokê, logo sutil) antes de considerar pronto.

## Fora de escopo

- Multi-cliente ativo simultâneo (logo do Modo B fixa no cliente ativo único por enquanto).
- SFX automático no Modo A (o campo `sfx_at` já existe no worker mas fica vazio por enquanto, igual ao Modo B hoje).
- Proteção contra loop infinito de "pedir ajuste" (é uma etapa manual, não automática).
