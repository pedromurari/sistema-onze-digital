# Kanban dentro de uma campanha de disparo — design

Data: 2026-08-06
Componentes: `DisparosMonitor.tsx` (existente, `CampanhaDetalheView`), `disparo_leads` (existente), sem tabelas/dependências novas.

## 1. Estado atual (confirmado por investigação de código)

- O sistema já tem um Kanban genérico e reutilizável: `src/components/crm/kanban/useKanbanColunas.ts` + `KanbanColunasUI.tsx`, usado hoje em `LancamentoKanban.tsx`, `NPAKanban.tsx`, `AulaSecretaKanban.tsx`, `SeuNumerologoKanban.tsx` e em `leads/LeadsQuadros.tsx` (a aba "Leads" → "Quadros" dentro de Disparos, que cobre todas as origens de lead, não uma campanha específica).
- Esse Kanban genérico usa colunas **customizáveis** guardadas em `kanban_colunas`, e move cards com um `<Select>` "Mover pra..." dentro do card — não há drag-and-drop real em nenhum lugar do projeto, e nenhuma lib de DnD está instalada.
- Dentro de uma campanha específica (`CampanhaDetalheView`, em `DisparosMonitor.tsx:1949`), os leads da campanha (`disparo_leads`) só aparecem em **tabela**, com filtro por status (chips: Todos/Pendente/Enviado/Erro/Respondeu) e busca por nome/telefone. É aqui que falta uma visão Kanban.
- `disparo_leads` relevante: `status` (`pendente`/`enviado`/`erro`), `ack_status` (`entregue`/`lido`/`falhou`, vem do webhook real do WhatsApp), `temperatura` (`quente`/`morno`/`frio`), `respondeu_em`/`ultima_resposta` (resposta do lead, sobrescrita a cada mensagem nova — não é histórico completo). `leadStatusDisplay()` já traduz status+ack em rótulos amigáveis (Pendente, Erro, Entregue, Lido, Não entregue, Enviado sem confirmação).
- Existe reset automático de retry após falha confirmada (`ack_status='falhou'` → volta lead pra `pendente`, limpando `sent_at`/`error_msg`/`instance_id`/`evolution_message_id`/`ack_status`), implementado em `evo-resposta/index.ts` (`handleMessagesUpdate`). O Kanban reaproveita essa mesma lógica de reset pro retry manual.

## 2. Escopo desta entrega (validado com o usuário)

- Kanban **só dentro de uma campanha específica** (`CampanhaDetalheView`) — não mexe no Kanban de "Quadros" que já existe na aba Leads geral.
- Colunas **fixas** (não customizáveis): Pendente, Enviado, Erro, Respondeu.
- Mover card: mesmo padrão do Kanban genérico (`<Select>` "Mover pra...", sem drag-and-drop, sem lib nova).
- Fora de escopo agora: chat/histórico de conversa (projeto separado, spec própria depois), qualquer mudança no Kanban de "Quadros" existente.

## 3. Colunas e classificação do lead

Cada `disparo_lead` cai em exatamente uma coluna, calculada por prioridade (não é o campo `status` puro):

1. Se `respondeu_em` não é nulo → coluna **Respondeu** (não importa o `status` de envio).
2. Senão, pelo `status`: `pendente` → **Pendente**, `enviado` → **Enviado**, `erro` → **Erro**.

Essa prioridade é a mesma já usada hoje na tabela (`statusFilter === 'respondeu'` tem precedência sobre o filtro de status).

## 4. Card

- Nome, telefone mascarado (`maskPhone`), badge de temperatura (`TEMP_CFG`: 🔥quente / 🌡️morno / ❄️frio).
- Na coluna **Enviado**: badge adicional com o rótulo fino de `leadStatusDisplay(status, ack_status)` (Entregue/Lido/Não entregue/Enviado sem confirmação), igual à tabela.
- Na coluna **Respondeu**: prévia de `ultima_resposta` (truncada) + horário formatado de `respondeu_em`, igual à célula de resposta já usada na tabela.
- Na coluna **Erro**: `error_msg` truncado.
- Clique no card: abre o mesmo detalhe/edição que a linha da tabela já abre hoje (reaproveita o comportamento existente, sem criar um modal novo).

## 5. Mover entre colunas

Select "Mover pra..." dentro do card, mas **as opções disponíveis dependem da coluna atual** — só dois movimentos são permitidos, porque são os únicos que representam uma ação real e não fabricam dado falso de envio/resposta:

- **Erro → Pendente** ("Reenviar"): `UPDATE disparo_leads SET status='pendente', sent_at=NULL, error_msg=NULL, instance_id=NULL, evolution_message_id=NULL, ack_status=NULL WHERE id=...` — idêntico ao reset automático de retry já existente.
- **Pendente → Erro** ("Marcar como erro"): `UPDATE disparo_leads SET status='erro', error_msg='Marcado manualmente como erro' WHERE id=...` — tira o lead da fila do próximo ciclo de envio sem apagar a linha.
- Cards nas colunas **Enviado** e **Respondeu** não têm select de mover (somente leitura) — essas colunas só são preenchidas pelo disparo-runner e pelo webhook `evo-resposta` de verdade, pra não corromper `leads_sent`/métricas da campanha nem fabricar uma resposta que não aconteceu.

## 6. Toggle de visão, busca e tempo real

- Toggle "Planilha / Kanban" no cabeçalho de `CampanhaDetalheView`, mesmo padrão visual (`TableIcon`/`Kanban`, grupo de botões pill) já usado no toggle da aba "Leads" geral.
- O campo de busca (nome/telefone) funciona igual nos dois modos, filtrando os leads antes de distribuir nas colunas.
- Os chips de filtro por status (Todos/Pendente/Enviado/Erro/Respondeu) só aparecem no modo Planilha — no Kanban as colunas já cumprem esse papel.
- A subscription realtime que já existe em `CampanhaDetalheView` (`supabase.channel('disparo_leads_detalhe_...')` ouvindo `postgres_changes` em `disparo_leads`) já recarrega `leads` a cada mudança — o Kanban consome o mesmo estado `leads`, sem subscription própria.

## 7. Testes/verificação

- Abrir uma campanha com leads em pelo menos 3 estados diferentes (pendente, enviado com ack, erro) e conferir que cada um cai na coluna certa.
- Simular uma resposta (via webhook de teste ou update direto de `respondeu_em`) e conferir que o card migra pra "Respondeu" independente do status de envio.
- Mover um lead de Erro → Pendente e confirmar que ele volta a ser pego pelo próximo ciclo do disparo-runner.
- Mover um lead de Pendente → Erro e confirmar que ele some da fila de envio.
- Conferir que não há opção de mover manualmente para Enviado ou Respondeu em nenhum card.
