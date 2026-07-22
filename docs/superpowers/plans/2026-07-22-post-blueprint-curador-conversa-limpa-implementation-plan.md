# Plano de implementação — blueprint visual, Curador e conversa limpa

## Objetivo

Implementar a especificação aprovada em `docs/superpowers/specs/2026-07-22-post-blueprint-curador-conversa-limpa-design.md` em dois projetos:

- aplicação, Supabase e orquestração: `C:\Users\igor_\OneDrive\Área de Trabalho\Sistema 11ds`;
- compositor Python: `C:\Users\igor_\OneDrive\Área de Trabalho\equipe-11ds-imagem`.

O cofre `11ds-conhecimento` continuará sendo atualizado pela integração GitHub/Obsidian; não haverá edição manual como fonte primária.

## Descobertas que orientam o plano

- `equipe-11ds-imagem/api/compositar.py` define `FEED_SIZE = (1080, 1350)`, contrariando o requisito 1:1.
- O compositor usa um cartão calculado por proporções genéricas e não recebe uma especificação geométrica versionada.
- A resposta retorna PNG em base64. Um PNG 4096 × 4096 pode exceder limites de resposta da Vercel.
- `equipe-11ds-executar` possui uma curadoria inferencial própria e `equipe-11ds-orquestrador` possui outra. Ambas usam a regra “na dúvida, não grave”.
- `equipe_11ds_memorias` não representa origem explícita, cliente, consumidores, substituição nem sincronização pendente.
- `Equipe11ds.tsx` concentra conversa, plano, histórico, tarefas e controles técnicos em mais de mil linhas.

## Ordem de execução

### Fase 0 — Proteção do trabalho existente

1. Conferir worktrees dos dois repositórios.
2. Preservar as alterações já existentes e não relacionadas em `funil-processar`, `vega-webhook`, `.claude`, `scripts` e a migração de disparos.
3. Criar branches de trabalho com prefixo `codex/` nos dois repositórios.
4. Registrar os SHAs de produção atuais para rollback.

Critério: os diffs da entrega contêm apenas arquivos relacionados a blueprint, Curador, compositor e conversa limpa.

### Fase 1 — Modelo de dados e armazenamento

Criar uma migração nova em:

`supabase/migrations/20260722_equipe_11ds_blueprints_memorias_sync.sql`

#### 1.1 Tabela `equipe_11ds_blueprints`

Campos:

- `id uuid`;
- `cliente_id uuid` com FK para `conteudo_clientes`;
- `nome text`;
- `tipo text` com `tipografico` ou `fotografico`;
- `versao integer`;
- `status text` com `ativo`, `substituido` ou `arquivado`;
- `referencia_url text`;
- `spec jsonb`;
- `criado_por uuid`;
- `substitui_id uuid` opcional;
- timestamps.

Restrições:

- versão única por cliente e tipo;
- um único blueprint ativo por cliente e tipo, usando índice parcial;
- RLS de leitura para autenticados e escrita apenas pelas Edge Functions.

#### 1.2 Evolução de `equipe_11ds_memorias`

Adicionar:

- `origem text` com `usuario` ou `agente`;
- `cliente_id uuid`;
- `regra text`;
- `evidencia jsonb`;
- `agentes_consumidores text[]`;
- `prioridade smallint`;
- `substitui_id uuid`;
- `github_sha text`;
- `tentativas_sync smallint`;
- `proxima_tentativa_em timestamptz`;
- `sincronizada_em timestamptz`;
- `erro_sync text`.

Alterar:

- `caminho_obsidian` para aceitar `NULL` enquanto a memória estiver pendente;
- status para `pendente_sincronizacao`, `ativa`, `substituida` e `arquivada`;
- dados existentes `ativa` permanecem válidos;
- dados antigos `invalidada` migram para `substituida`; `removida` migra para `arquivada`.

Índices:

- cliente + tipo + status;
- status + próxima tentativa;
- hash de conteúdo por cliente para deduplicação.

#### 1.3 Auditoria visual do post

Adicionar em `conteudo_posts`:

- `blueprint_id uuid`;
- `blueprint_versao integer`;
- `qa_visual jsonb`;
- `qa_visual_status text` com `pendente`, `aprovado` ou `reprovado`.

#### 1.4 Storage

Criar ou confirmar os caminhos:

- `equipe-11ds-referencias/blueprints/<cliente>/<versao>/reference.png`;
- `equipe-11ds-criativos/tmp/<tarefa>/source.png`;
- `equipe-11ds-criativos/<tarefa>-feed.png`.

Uploads de referência vêm do usuário autenticado; fontes temporárias e resultados são gravados por URLs assinadas de escopo e duração limitados.

#### 1.5 Tipos TypeScript

Atualizar `src/integrations/supabase/types.ts` com os novos campos e tabelas após aplicar a migração.

Testes da fase:

- aplicar a migração em banco de teste ou branch;
- provar o índice de um blueprint ativo por cliente/tipo;
- provar a transição pendente → ativa;
- provar as políticas RLS com usuário autenticado e usuário diferente.

### Fase 2 — Curador determinístico e sincronização confiável

#### 2.1 Módulo compartilhado

Criar:

`supabase/functions/_shared/equipe-11ds/memoria.ts`

Responsabilidades:

- normalizar uma diretiva explícita;
- deduplicar por cliente, tipo e hash semântico/normalizado;
- criar ou substituir memória no Supabase;
- definir o caminho consolidado do Obsidian;
- montar Markdown estável;
- atualizar estado e metadados de sincronização.

Não deve decidir se uma diretiva explícita merece ser salva. Essa decisão já foi tomada pelo usuário ao confirmar o plano.

#### 2.2 Ferramenta `registrar_diretiva`

Alterar:

`supabase/functions/equipe-11ds-orquestrador/index.ts`

Adicionar a ferramenta fechada `registrar_diretiva`.

O planejador inclui essa etapa quando:

- o agente selecionado é o Curador;
- existe referência anexada;
- a mensagem contém uma preferência, correção, aprovação ou proibição durável;
- o contexto da ação marca `memoria_explicita: true`.

O GPT estrutura tipo, escopo, regra e consumidores. Depois da confirmação, o servidor persiste a memória sem um segundo julgamento `gravar: false`.

O plano exibido informa claramente qual memória será criada ou substituída.

#### 2.3 Curadoria inferencial

Manter `curar_memoria` para resultados dos agentes, com os três critérios rigorosos. Alterar o resultado de descarte para auditoria técnica, sem criar mensagens repetitivas na conversa principal.

Modificar também:

`supabase/functions/equipe-11ds-executar/index.ts`

O `passoCurador` diário continua inferencial e usa o módulo compartilhado apenas depois de `registrar=true`. Feedback recebido por “Pedir correção” entra como origem `usuario` e ignora esse veto.

#### 2.4 Worker de sincronização

Criar:

`supabase/functions/equipe-11ds-memoria-sync/index.ts`

Fluxo:

1. selecionar memórias pendentes cujo retry venceu;
2. agrupar por nota consolidada;
3. ler nota e SHA do GitHub;
4. fazer merge determinístico das seções ativas;
5. gravar no GitHub com SHA;
6. marcar memória ativa com `github_sha`, caminho e horário;
7. em erro, incrementar tentativa e calcular backoff;
8. interromper retry automático após o limite e expor ação manual.

Notas consolidadas:

- `Clientes/<slug>/identidade-visual.md`;
- `Clientes/<slug>/copy.md`;
- `Equipe/Processos/<slug>.md`.

Adicionar a função em `supabase/config.toml`. O orquestrador dispara uma tentativa imediata após confirmar a memória. Um agendamento curto processa pendências; ele não cria novas decisões, apenas conclui uma escrita já confirmada.

#### 2.5 Leitura de memória

Alterar `buscarMemoriaObsidian` e o carregamento do executor para priorizar o índice Supabase:

- recuperar somente memórias `ativas` ou `pendente_sincronizacao` já confirmadas;
- ignorar substituídas/arquivadas;
- injetar blueprint e regras de maior prioridade antes de notas gerais;
- usar GitHub como conteúdo humano complementar, não como único índice.

Testes da fase:

- diretiva do usuário sempre cria memória pendente;
- GPT não consegue vetar origem `usuario`;
- inferência fraca não cria memória;
- duplicata não cria segunda regra ativa;
- substituição desativa a anterior;
- falha GitHub agenda retry;
- sucesso preenche SHA e estado ativo;
- memória ativa aparece no contexto dos agentes consumidores.

### Fase 3 — Compositor 1:1, blueprint e QA

Esta fase altera o repositório externo:

`C:\Users\igor_\OneDrive\Área de Trabalho\equipe-11ds-imagem`

Antes da execução será necessária permissão de escrita específica para esse diretório.

#### 3.1 Separar responsabilidades

Criar:

- `api/blueprints.py`: valida e resolve a especificação geométrica;
- `api/qa_visual.py`: métricas e decisão do QA;
- `tests/test_blueprint_tipografico.py`;
- `tests/test_qa_visual.py`;
- `tests/fixtures/` com payload e imagens pequenas de teste.

Manter `api/compositar.py` como entrada HTTP e orquestração do Pillow.

#### 3.2 Novo contrato de entrada

O payload v2 recebe:

- `blueprint_id` e `blueprint_versao`;
- `blueprint_spec` validada;
- URLs de leitura para fundo, referência e fonte fotográfica;
- URL assinada de upload para o feed;
- headline com runs de destaque explícitos;
- identidade do cliente;
- `modo` e `gerar_stories`.

O v1 em base64 permanece temporariamente compatível durante o rollout e é removido somente após validação.

#### 3.3 Transporte sem base64 do resultado

O compositor renderiza e envia o PNG diretamente à URL assinada do Supabase Storage. A resposta contém apenas:

- caminho do arquivo;
- largura e altura;
- hash;
- blueprint usado;
- métricas e status do QA.

Isso evita exceder limites de resposta da Vercel em 4096 × 4096.

#### 3.4 Render tipográfico

Substituir `FEED_SIZE = (1080, 1350)` por canvas quadrado 4096 × 4096 no contrato v2.

O blueprint do Instituto fixa em percentuais:

- área do cartão;
- margens e raio;
- cabeçalho, avatar, nome, badge e handle;
- separador luminoso;
- área e escala da headline;
- destaque dourado;
- CTA e linha inferior;
- zonas de grafismos, folhas, mapa numerológico e onda dourada.

Os ornamentos são uma camada determinística do blueprint, não uma decisão aleatória do GPT. A referência aprovada serve para construir uma base limpa quadrada sem texto; o compositor sempre aplica texto e logo reais por cima.

#### 3.5 Render fotográfico

- canvas final 4096 × 4096;
- fonte fotográfica vem por URL;
- crop respeita zona de assunto do blueprint;
- tratamento, overlay, headline, logo e CTA usam a identidade ativa;
- nenhum texto é solicitado ao gerador de imagem.

#### 3.6 QA visual

O compositor calcula antes de fazer upload:

- proporção e dimensões;
- bounding boxes de texto e ausência de corte;
- número de linhas;
- escala relativa do cartão, logo, headline e CTA;
- margens seguras;
- contraste local das áreas de texto;
- presença das camadas obrigatórias;
- hash e versão dos assets.

Falha determinística retorna `qa_status=reprovado` e não marca a peça como pronta. O executor pode recompor no máximo duas vezes para falhas corrigíveis.

#### 3.7 Recursos e runtime

- elevar `maxDuration` em `vercel.json` se o render 4K exigir;
- limitar imagens abertas simultaneamente;
- fechar objetos Pillow explicitamente;
- medir memória e tempo em teste;
- manter fontes e assets versionados.

Testes da fase:

- saída exatamente 4096 × 4096;
- headline longa reduz sem ultrapassar limite mínimo;
- palavra destacada usa dourado;
- QA rejeita 4:5, overflow e ausência de identidade;
- resposta v2 não contém base64;
- upload assinado recebe o PNG;
- payload v1 continua funcionando durante o rollout.

### Fase 4 — Integrar blueprint e QA ao executor

Alterar:

`supabase/functions/equipe-11ds-executar/index.ts`

#### 4.1 Contexto do cliente

Carregar o blueprint ativo do cliente junto ao contexto. Para tipográfico, ausência de blueprint ativo é erro claro e bloqueante; não cair em perfil genérico.

#### 4.2 Produção

No `passoProducao`:

1. subir a fonte temporária quando necessário;
2. criar URLs assinadas de leitura e upload;
3. enviar o payload v2 ao compositor;
4. validar resposta, dimensões e QA;
5. registrar `blueprint_id`, versão e `qa_visual` no post;
6. recompor apenas em falhas corrigíveis;
7. limpar arquivos temporários após sucesso ou expiração.

#### 4.3 Headline estruturada

O Redator retorna também `headline_runs`, separando texto normal e destaque. O compositor deixa de interpretar asteriscos como única fonte de verdade.

#### 4.4 Gestor

O Gestor não aprova apenas legenda. Ele exige `qa_visual_status=aprovado` antes de concluir a tarefa. A evidência informa blueprint, versão, tamanho, tentativas e métricas principais.

Testes da fase:

- cliente sem blueprint falha com ação de correção;
- peça reprovada não vira post pronto;
- segunda tentativa substitui o mesmo caminho, sem duplicar post;
- peça aprovada persiste versão e QA;
- alternância tipográfico/fotográfico continua determinística.

### Fase 5 — Interface “Conversa limpa”

Refatorar:

`src/components/crm/Equipe11ds.tsx`

Criar o diretório:

`src/components/crm/equipe11ds/`

Arquivos previstos:

- `types.ts`;
- `AgentConversationPanel.tsx`;
- `AgentConversationHeader.tsx`;
- `AgentConversationTimeline.tsx`;
- `ActionPlanCard.tsx`;
- `ExecutionProgressCard.tsx`;
- `MemorySavedCard.tsx`;
- `PostResultCard.tsx`;
- `AgentComposer.tsx`;
- `TechnicalDetailsDisclosure.tsx`;
- `useAgentConversation.ts`.

#### 5.1 Hierarquia

- cabeçalho compacto;
- conversa como área principal;
- compositor fixo;
- plano, progresso, memória e resultado renderizados como eventos da conversa;
- detalhes técnicos recolhidos.

Remover da visão principal:

- “Avulso”;
- ficha de cargo completa;
- últimas decisões repetidas;
- grupos de tarefas;
- slugs de agentes;
- nomes de ferramentas e evidências técnicas abertas.

Esses dados permanecem disponíveis em `Ver detalhes` quando úteis.

#### 5.2 Anexos e memória

O `AgentComposer` aceita imagem de referência, faz upload e inclui no contexto do plano:

- URL;
- nome;
- MIME;
- cliente;
- `memoria_explicita=true` quando enviado ao Curador ou pela ação “Ensinar referência”.

O cartão do plano mostra a memória que será criada. Depois da confirmação, `MemorySavedCard` exibe `Salva`, `Aguardando sincronização` ou `Erro ao sincronizar`.

#### 5.3 Resultado do post

`PostResultCard` mostra:

- imagem grande sem `object-cover` destrutivo;
- formato e resolução;
- versão do blueprint;
- legenda;
- `Abrir em Posts`, `Baixar` e `Pedir correção`.

“Pedir correção” abre texto contextualizado e marca a orientação como memória explícita quando ela descreve uma preferência durável.

#### 5.4 Tipos e acessibilidade

- remover `any` novos e tipar respostas do orquestrador;
- preservar navegação por teclado;
- adicionar `aria-label` em anexos e ações icônicas;
- não depender apenas de cor nos estados;
- validar mobile e desktop.

#### 5.5 Testes frontend

Adicionar Vitest e Testing Library se ainda não existirem.

Testar:

- termo “Avulso” ausente da interface principal;
- plano simples e confirmação única;
- progresso por nomes humanos;
- memória salva e pendente;
- detalhes técnicos fechados por padrão;
- resultado do post sem crop;
- upload de referência;
- estados mobile essenciais.

### Fase 6 — Registrar o blueprint aprovado do Instituto

1. Preparar uma base visual limpa quadrada inspirada na `Frame 1`, sem texto ou logo incorporados.
2. Armazenar a referência original e a base limpa no Storage.
3. Criar `equipe_11ds_blueprints` versão 1 para o Instituto.
4. Criar memória explícita ativa: “Frame 1 é o blueprint obrigatório dos posts tipográficos, adaptado para 1:1”.
5. Definir consumidores `diretor-arte`, `nina-producao` e `gestor-midia`.
6. Sincronizar `Clientes/instituto-despertamente/identidade-visual.md`.
7. Confirmar que o orquestrador recupera essa regra antes de gerar o post.

Essa operação usa a mesma confirmação única do plano e fica auditável.

### Fase 7 — Validação local e integrada

#### Aplicação

- `npm run build`;
- `tsc --noEmit`;
- testes Vitest direcionados;
- `git diff --check`;
- análise de bundle e erros novos de lint nos arquivos alterados.

#### Edge Functions

- parse/bundle de `equipe-11ds-orquestrador`;
- parse/bundle de `equipe-11ds-executar`;
- parse/bundle de `equipe-11ds-memoria-sync`;
- teste de OPTIONS e autenticação;
- teste de idempotência e retry.

#### Compositor

- `pytest`;
- teste 4096 × 4096;
- tempo e memória do render;
- teste de upload assinado;
- comparação visual com o blueprint aprovado.

### Fase 8 — Deploy seguro

Ordem:

1. aplicar migração compatível com o código antigo;
2. publicar compositor v2 mantendo compatibilidade v1;
3. executar smoke test v1 e v2;
4. publicar `equipe-11ds-memoria-sync`;
5. publicar orquestrador e executor;
6. registrar blueprint e memória do Instituto;
7. publicar frontend;
8. testar produção autenticada;
9. remover compatibilidade v1 somente em uma entrega posterior.

Branches de produção precisam continuar sincronizadas conforme a configuração atual da Vercel.

### Fase 9 — Aceite em produção

Executar um plano seguro com o Curador:

- anexar a referência;
- revisar a memória prevista;
- confirmar uma vez;
- verificar memória pendente e depois ativa;
- abrir a nota consolidada do Obsidian.

Executar um post tipográfico:

- confirmar 4096 × 4096;
- comparar lado a lado com a referência;
- verificar cartão dominante, hierarquia, ornamentos, dourado e CTA;
- verificar QA aprovado;
- abrir o resultado na nova conversa.

Executar o próximo post fotográfico:

- confirmar alternância;
- verificar cena temática e identidade;
- verificar QA aprovado.

## Rollback

- Migração é aditiva e mantém leitura dos campos antigos.
- Compositor v1 permanece disponível durante o rollout.
- Executor pode voltar temporariamente ao payload v1 por variável de ambiente.
- Blueprint novo pode ser arquivado e o anterior reativado.
- Memórias podem ser arquivadas sem apagar auditoria.
- Frontend pode ser revertido pelo deployment anterior sem perder dados.

## Definition of Done

- feed novo é 4096 × 4096;
- blueprint do Instituto está ativo, versionado e recuperado pelos agentes;
- post tipográfico mantém hierarquia e riqueza da referência;
- QA bloqueia entrega fora do padrão;
- diretiva explícita é persistida sem veto do GPT;
- Obsidian confirma sincronização ou mostra retry acionável;
- painel usa a conversa limpa aprovada;
- confirmação continua única;
- testes dos dois repositórios passam;
- fluxo completo passa em produção com evidências.

## Permissões necessárias para a execução

- escrita específica em `C:\Users\igor_\OneDrive\Área de Trabalho\equipe-11ds-imagem`;
- aplicação da migração e deploy das Edge Functions no projeto Supabase já conectado;
- deploy do projeto Vercel `equipe-11ds-imagem`;
- deploy do frontend `onze-digital`;
- gravação da memória aprovada no repositório GitHub/Obsidian `11ds-conhecimento` pelo fluxo do sistema.
