# Reels IDM — Modo A, padrão de edição premium

## Objetivo

Travar um padrão fixo de edição pro Modo A (roteiro → narração IA → Ken Burns), replicando o nível de um editor humano de referência: tipo de imagem, tipografia/hierarquia de legenda, música de fundo, efeitos sonoros contextuais e posição de logo. Esse padrão vale só pro Modo A — o Modo B (vídeo próprio do cliente) não muda.

## Contexto

- Modo A já roda ponta a ponta (spec anterior: `2026-07-26-reels-modo-a-roteiro-video-design.md`), com um ajuste feito durante os testes: a busca de imagem trocou de `gpt-image-1.5` pra Pexels (fotos de banco reais), e o acabamento (grade de cor/vinheta/grain/legenda/logo) foi movido pra dentro de cada render de cena individual — o passo de finalize hoje só concatena via stream-copy, sem re-encode, pra não estourar o timeout de ~150s da Supabase Edge Function / 140s da Vercel.
- Essa spec parte de um vídeo de referência enviado pelo usuário (conteúdo real de Instagram, nicho de psicologia/motivacional) e define o "estilo de casa" a partir da análise desse vídeo: pinturas clássicas e fotos de arquivo histórico real, legenda em blocos de frase com hierarquia de destaque (não karaokê palavra-por-palavra), música orquestral contínua, logo grande centralizada, efeitos sonoros contextuais (teclado digitando, sino de atenção).
- Todas as decisões de conteúdo por vídeo (que palavra destacar, que imagem buscar, se cabe um efeito sonoro) continuam sendo responsabilidade do Roteirista (mesmo agente, mesma chamada) — não cria agente novo.

## 1. Imagem de cena: Wikimedia Commons no lugar do Pexels

- Pinturas clássicas e fotos de arquivo histórico real substituem foto stock moderna. Pexels não tem cobertura boa desse acervo; Wikimedia Commons tem os dois (obras de arte digitalizadas e fotografias históricas), API gratuita, sem chave.
- Busca via `https://commons.wikimedia.org/w/api.php` (`generator=search`, `gsrnamespace=6`, `prop=imageinfo`, `iiprop=url|extmetadata`), usando o `image_prompt` do bloco como termo de busca.
- Filtro de licença: só aceita resultado com `extmetadata.LicenseShortName` de domínio público ou CC0 (nunca licença que exija atribuição visível — não há onde colocar crédito no vídeo). Pula pro próximo resultado da busca até achar um elegível; se nenhum dos resultados servir, cai pro Pexels como rede de segurança (só nesse caso, pra nunca travar o job por falta de imagem).
- O crop pra 9:16 (scale + crop centralizado) já existe no worker (`kenburns.ts`) e não muda — funciona com qualquer proporção de entrada.
- `image_prompt`: o Roteirista passa a escrever termos de busca de obra de arte / foto de arquivo (ex: "retrato pintura óleo mulher pensativa século XIX", ou o nome de uma figura histórica real quando for o caso), não mais descrição de foto editorial realista.

## 2. Legenda: sistema de 3 camadas

Substitui completamente o karaokê palavra-por-palavra atual (fonte Anton, destaque de cor por palavra falada).

- **Normal** — Poppins ExtraBold, branco, sem contorno duro. Texto aparece em blocos de 2-4 palavras (mesma lógica de agrupamento por pausa >0.35s que já existe em `gerarLegendaKaraoke`, só com o teto de palavras por bloco reduzido de 6 pra 4), trocando de bloco conforme a fala avança. Sem highlight progressivo por palavra.
- **Destaque** — mesma fonte, tamanho maior (~1.25x). 1-2 palavras por bloco de roteiro, marcadas pelo Roteirista por **significado** (`emphasis_words`), não por duração de áudio. No render, casa a palavra marcada com o tempo real dela no transcript do bloco (Whisper) por substring case/acento-insensível; se não achar (erro de transcrição, palavra reescrita pelo TTS), cai pra heurística já existente hoje (palavra de maior duração/pós-pausa dentro daquele bloco) — nunca fica sem destaque nenhum, nunca quebra.
- **Conceito** — dourado, itálico serifado (fonte nova), tamanho maior ainda. Reservado pra **1 palavra em todo o roteiro** (a palavra-tese do gancho, tipicamente no bloco 0), marcada pelo Roteirista em `video_scripts.concept_word`. Mesmo mecanismo de casamento com o tempo real / fallback da camada Destaque; se a palavra não for encontrada em nenhum bloco, a camada Conceito simplesmente não aparece nesse vídeo (não é crítico).

Fontes novas a bundlar no worker (mesmo padrão do Anton hoje — down load do Google Fonts, licença OFL, `assets/fonts/`, `fontsdir` no filtro `subtitles`): Poppins (peso 800/900) e uma serifada itálica de destaque (Playfair Display Italic). Anton sai de uso.

## 3. Figuras históricas reais — cartão de nome

- A regra atual do Roteirista ("nunca pessoa real e nomeada") é relaxada pro Modo A: como a imagem agora vem de arquivo real (Wikimedia Commons), citar uma figura histórica real com a foto real dela é legítimo — estilo documentário, sem retrato falso gerado por IA.
- Bloco ganha `figure_name` / `figure_role` opcionais. Quando presentes, a legenda desse bloco específico vira um **cartão fixo** (nome em dourado serifado maior, cargo em branco itálico menor, ambos estáticos por cima da imagem daquele bloco) — não segue a fala palavra a palavra, não usa as camadas Normal/Destaque/Conceito. É um modo de legenda à parte, só pra esse bloco.
- O `image_prompt` desse bloco deve buscar uma foto/retrato real dessa pessoa especificamente (ex: nome completo + "retrato" ou "fotografia").

## 4. Música de fundo e efeitos sonoros

Sem integração de API de terceiro rodando na esteira — os arquivos são curados uma vez (por mim, agora, como parte da implementação) e sobem pro Storage. Fontes: freepd.com (100% domínio público) pra música, banco de som CC0 pra efeitos. O usuário não precisa baixar/subir nada.

- **Música** — ~6-8 faixas instrumentais (`idm-reels` bucket, pasta `audio/music/`). Escolhida **uma vez por job** (armazenada em `video_jobs.music_track_url`, pra retentativa não trocar de faixa no meio do caminho) e aplicada só no passo de **finalize**: concatena os clipes de cena via stream-copy de vídeo (`-map 0:v -c:v copy`, sem re-encode, mantém o fix de timeout) e mixa a música por baixo do áudio já pronto de cada clipe (voz + SFX) via `amix`, com volume baixo (ducking simples, nível fixo abaixo da voz) — só o áudio é re-codificado (`-c:a aac`), operação rápida, sem risco de estourar o timeout de novo. Música é cortada/loopada pra cobrir a duração total do vídeo.
- **Efeitos sonoros** — pasta `audio/sfx/<tag>/` com poucas variações por tag (`teclado`, `sino`, `notificacao`). Contextual: o Roteirista marca `sfx_tag` num bloco só quando o conteúdo daquele bloco realmente pede (ex: fala de escrever/pesquisar → `teclado`; virada/alerta/insight → `sino`), a maioria dos blocos fica sem SFX (`sfx_tag: null`) — não é "todo corte tem efeito". Mixado dentro do próprio render da cena (já é um passo de encode, não adiciona chamada nova), volume moderado, tocando desde o início do clipe daquele bloco.

## 5. Logo

Passa de "pequena, canto inferior direito, 55% opacidade" pra "grande, centralizada horizontalmente, próxima da base, mesma opacidade". Aplicado no mesmo lugar de hoje (dentro do render de cada cena — `renderizarCena`), só muda o `overlay=` (posição) e o `scale=` (tamanho) do filtro de logo.

## Mudanças de schema

Todas aditivas, sem migração pesada:

- `video_scripts`: nova coluna `concept_word text null`.
- `video_jobs`: nova coluna `music_track_url text null`.
- `video_scripts.blocks` (já é `jsonb`, sem migração de coluna): cada bloco ganha `emphasis_words: string[]` (0-2 itens), `sfx_tag: 'teclado' | 'sino' | 'notificacao' | null`, `figure_name: string | null`, `figure_role: string | null`.

## Mudanças em `equipe-11ds-roteiro-executar`

- Prompt do Roteirista reescrito: novo formato de `image_prompt` (termo de busca de arte/arquivo, não foto editorial), instruções pra `emphasis_words` (1-2 por bloco, por significado), `concept_word` (1 por roteiro inteiro, opcional), `sfx_tag` (esparso, só quando fizer sentido, maioria `null`), `figure_name`/`figure_role` (só quando citar pessoa real específica).
- Gestor de Vídeo (QA) ganha checagem leve: `concept_word` de fato aparece no texto de algum bloco, `sfx_tag` não está sendo usado em excesso (regra simples, não um agente novo).

## Mudanças em `idm-video-processar`

- `buscarImagemPexels` → `buscarImagemWikimedia` (com fallback pro Pexels existente só quando a busca no Commons não retornar nenhum resultado elegível por licença).
- Passo `generating_scenes`: sem mudança estrutural, só troca a função de busca de imagem.
- Passo `rendering` (por cena): passa a incluir `emphasis_words`, `sfx_tag` (com a URL do SFX já resolvida a partir da tag) e `figure_name`/`figure_role` na chamada pro worker `/api/render-scene`, além do que já manda hoje (imagem, áudio, duração, legenda normal, logo).
- Antes do primeiro `render-scene` de um job, se `video_jobs.music_track_url` ainda não estiver setado, sorteia uma faixa da pasta `audio/music/` e grava na coluna (idempotente — só seta se ainda for null).
- Passo `rendering` (finalize): passa a incluir `music_track_url` na chamada pro worker `/api/render-scenes`.

## Mudanças no worker (`equipe-11ds-video`)

- `lib/legenda.ts`: nova função de geração de `.ass` com as 3 camadas (Normal/Destaque/Conceito) substituindo o karaokê atual; nova função separada pra gerar o cartão de nome estático (`figure_name`/`figure_role`).
- `lib/kenburns.ts` (`renderizarCena`): logo reposicionado/redimensionado (overlay central-baixo, maior); filtro de áudio ganha mixagem opcional de SFX (`amix` com a narração) quando `sfx_tag` vier preenchido.
- `api/render-scene.ts`: body ganha `emphasis_words`, `concept_word`, `sfx_url` (já resolvida), `figure_name`, `figure_role`.
- `api/render-scenes.ts` (finalize): ganha `music_track_url` no body; deixa de ser stream-copy puro — vídeo continua `-c:v copy`, áudio ganha `amix` com a música e é re-codificado (`-c:a aac`).
- Fontes novas em `assets/fonts/`: Poppins ExtraBold, Playfair Display Italic (Anton sai).

## Assets a preparar (parte da implementação, não do usuário)

- Baixar ~6-8 faixas instrumentais do freepd.com, subir pro bucket `idm-reels`, pasta `audio/music/`.
- Baixar um pequeno conjunto de SFX CC0 por tag (`teclado`, `sino`, `notificacao`), subir pra `audio/sfx/<tag>/`.
- Baixar as fontes Poppins ExtraBold e Playfair Display Italic (Google Fonts, OFL) pro worker.

## Validação

Reprocessar um roteiro de teste (pode reaproveitar o job já existente, gerando roteiro novo ou reescrevendo o atual com os campos novos) e conferir no vídeo final: imagens de arquivo/pintura reais (não mais foto stock), legenda em 3 camadas visíveis e coerentes com o que foi dito, cartão de nome quando houver figura histórica, música de fundo contínua sob a narração, SFX contextual nos blocos marcados, logo grande centralizada.

## Fora de escopo

- Modo B (vídeo próprio do cliente) — continua com o acabamento atual, sem música/SFX/legenda em camadas.
- Busca automática de música/SFX via API em tempo real — pacote fixo curado, sem integração viva.
- Multi-cliente ativo simultâneo (mesma ressalva da spec anterior).
- Ajuste fino de ducking dinâmico (baixar música automaticamente só durante fala vs nível fixo) — fica com nível fixo por enquanto; se soar mal na validação, isso vira um ajuste futuro.
