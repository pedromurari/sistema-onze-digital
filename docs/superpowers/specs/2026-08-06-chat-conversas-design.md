# Chat de conversas (estilo WhatsApp) — design

Data: 2026-08-06
Componentes: `DisparosMonitor.tsx` (existente, novo mainTab), `leads_unificados` (existente, view), `disparo_leads`/`alunos`/`turmas`/`pagamentos` (existentes, só leitura), `financial-utils.ts` (existente, cálculo canônico de inadimplência), `evo-resposta`/`disparo-runner`/`boas-vindas-enviar`/`enviar-cobranca` (existentes, ganham instrumentação), novos: tabela `whatsapp_mensagens`, componente `FichaAlunoResumo` (somente leitura).

**`Financeiro.tsx` não é modificado por esta entrega.**

## 1. Estado atual (confirmado por investigação de código)

- Não existe histórico bidirecional de conversa em lugar nenhum do sistema hoje. O que existe é sempre "última mensagem", sobrescrita a cada evento novo:
  - `disparo_leads.ultima_resposta`/`respondeu_em`, `boas_vindas_logs.ultima_resposta`/`respondeu_em`, `cobranca_logs.ultima_resposta`/`respondeu_em` — todos sobrescritos pelo `evo-resposta` a cada mensagem inbound nova, pro telefone que casar.
  - `lead_respostas` guarda histórico inbound, mas só pra leads que batem com `lancamento_leads` — não cobre `disparo_leads`, `alunos` (cobrança) nem boas-vindas.
  - `cobranca_ia_mensagens` guarda histórico bidirecional completo, mas é exclusivo do fluxo de IA de cobrança (`cobranca-ia-responder`) — não é genérico.
- `evo-resposta/index.ts` já é o único ponto de entrada de toda mensagem inbound (webhook da Evolution API), com `normalizePhone()` (normaliza pra 11 dígitos BR) e matching por sufixo de 8 dígitos (`s8`) contra várias tabelas (`lancamento_leads`, `disparo_leads`, `boas_vindas_logs`, `cobranca_logs`). Esse é o padrão de matching que a tabela nova reaproveita.
- `leads_unificados` (view, `20260727100000_leads_unificados_view.sql`) já unifica `lancamento_leads`, `npa_evento_leads`, `alunos` (com turma via join com `turmas`) e `seu_numerologo_leads`, com `temperatura` calculada (`quente`/`morno`/`frio`) e `origem` (nome legível do lançamento/evento, ou `'Aluno: ' || turma.nome`).
- `disparo_leads` é um snapshot no momento da criação da campanha (`nome`, `phone`, `temperatura`) — não tem FK de volta pra `leads_unificados`. Leads importados por CSV ou grupo de WhatsApp só existem aqui, nunca aparecem em `leads_unificados`.
- Os 3 pontos de envio que vão alimentar o histórico (`disparo-runner`, `boas-vindas-enviar`, `enviar-cobranca`) já têm a mensagem final (com variáveis já aplicadas) disponível em uma variável local logo antes da chamada `fetch` pro endpoint `sendText` da Evolution API — não precisa reconstruir o template em lugar nenhum.
- **Ficha do aluno completa (editável) já existe**, embutida em `Financeiro.tsx`: `Dialog` controlado por `alunoDetail`/`setAlunoDetail`, ocupando as linhas **3195–3895 (700 linhas de JSX)**, mais handlers espalhados (`saveAlunoDetail`, `marcarComoPago`, `estornarPagamento`, `downloadFichaPDF`, upload de contrato) e ~30 pedaços de estado do componente pai (`pagamentos`, `turmas`, `editAlunoForm`, `parcelasLocais`, `pagoInfo`, `canaisCobranca`, ...). Também dispara um segundo modal (confirmar pagamento, linha 3898) que vive fora dela.
- **O projeto não tem nenhum teste automatizado** — sem vitest/jest/playwright configurado e sem nenhum arquivo `.test`/`.spec` em `src/`. A única verificação automática disponível é `tsc --noEmit` e o build.
- Já existe deep-link pra ficha completa vindo de outra tela: `CRMLayout.tsx:223` reconhece a view `financeiro_aluno_<id>` e passa `initialAlunoId` pro `Financeiro`, que abre a ficha daquele aluno (`Financeiro.tsx:978`). Hoje é usado pelo `Equipe11ds` (`onNavigateToAluno`). Serve como saída pra edição a partir do Chat.
- `alunos` tem os campos que a ficha resumida precisa: dados cadastrais, `status`, `forma_pagamento`, `valor_mensalidade`, `dia_vencimento`, `data_matricula`, `mensalidades_pagas`/`total_mensalidades` e o bloco de contrato (`forms_respondido`, `contrato_enviado`, `contrato_assinado`).
- `financial-utils.ts` tem o cálculo canônico de inadimplência (`isPagamentoInadimplente`, `calcInadimplencia`), compartilhado hoje por Dashboard/Financeiro/FinanceiroCFO/Cobranca. É a fonte de verdade pra "situação" do aluno — não replicar a regra.

## 2. Escopo desta entrega (validado com o usuário)

- Universo de leads: todos do sistema (mesmo escopo de `leads_unificados`, mais os leads exclusivos de `disparo_leads` como fallback — CSV/grupo).
- Fontes de mensagem **enviada** que entram no histórico: campanhas de disparo, boas-vindas, cobrança.
- Somente leitura — sem responder pela tela do Chat nessa entrega.
- **4 abas** dentro do Chat: Aluno, Lead Frio, Lead Quente (conversas — só quem tem ≥1 mensagem) e **Cobrança** (carteira — todos os alunos, com ou sem mensagem, com situação financeira e ficha de matrícula).
- Fora de escopo agora: mensagens de sequência de funil (dia-a-dia agendado) como fonte de histórico, histórico anterior à data em que a instrumentação entrar no ar (não há backfill retroativo dos logs existentes).

### Restrição inegociável: dados reais de alunos pagantes

Estes são alunos pagantes reais, e o código que gera parcelas e dá baixa em pagamento não tem cobertura de teste nenhuma. A decisão de design que segue disso: **esta entrega inteira é somente leitura sobre o financeiro.**

- Nenhuma linha de `Financeiro.tsx` é modificada. A ficha completa e editável continua exatamente como está hoje, no lugar onde está hoje.
- Nenhuma mudança de schema em `alunos`, `pagamentos` ou `turmas`.
- Nenhum código do Chat escreve em `alunos` ou `pagamentos` — a única tabela que esta entrega escreve é `whatsapp_mensagens` (nova, isolada, sem FK pro financeiro).
- A ficha dentro do Chat (`FichaAlunoResumo`, seção 7) **só faz SELECT**. Não tem botão de salvar, marcar pago, estornar, editar nem upload. Para qualquer alteração, o usuário é levado pra ficha completa no Financeiro pelo deep-link que já existe.

Foi considerada e **descartada** a alternativa de extrair a ficha editável de `Financeiro.tsx` pra um componente reutilizável: 700 linhas de JSX + ~30 dependências de estado do pai, sem nenhum teste automatizado no projeto pra pegar regressão, e cuja validação exigiria dar baixa/estornar pagamento em aluno real só pra testar. O ganho (editar sem trocar de tela) não paga esse risco.

## 3. Tabela nova: `whatsapp_mensagens`

```sql
CREATE TABLE public.whatsapp_mensagens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone            TEXT NOT NULL,          -- normalizado, 11 dígitos BR (mesmo formato de normalizePhone())
  direcao             TEXT NOT NULL CHECK (direcao IN ('recebida', 'enviada')),
  conteudo            TEXT NOT NULL,
  tipo                TEXT NOT NULL DEFAULT 'text',   -- text/image/video/audio/document/sticker/unknown
  origem              TEXT NOT NULL CHECK (origem IN ('inbound', 'disparo', 'boas_vindas', 'cobranca')),
  evolution_instance  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_mensagens_telefone_created ON public.whatsapp_mensagens(telefone, created_at);
```

RLS: `ENABLE ROW LEVEL SECURITY` + policy `FOR ALL TO authenticated USING (true) WITH CHECK (true)`, mesmo padrão de `disparo_campanhas`/`disparo_leads`. Publicada em `supabase_realtime` pra alimentar a tela em tempo real.

## 4. Instrumentação dos 4 pontos de envio/recebimento

Todos os inserts são best-effort (`try/catch`, log de erro, nunca interrompem o fluxo principal de envio/recebimento):

- **`evo-resposta`** (inbound): logo depois de `extractText()` calcular `mensagem`/`mensagemTipo` e antes dos matches por tabela, insere `{ telefone: phone, direcao: 'recebida', conteudo: mensagem, tipo: mensagemTipo, origem: 'inbound', evolution_instance: instance }` — incondicional, independente de casar com alguma tabela (uma conversa só aparece na tela se tiver match em `leads_unificados`/`disparo_leads`, mas a mensagem em si fica salva).
- **`disparo-runner`**: depois do `fetch` de `sendText` retornar sucesso, insere `{ telefone: normalizePhone(lead.phone), direcao: 'enviada', conteudo: <texto renderizado>, tipo: campanha.message_type, origem: 'disparo', evolution_instance: inst.instance_name }`.
- **`boas-vindas-enviar`**: mesmo padrão, no ponto onde `mensagem` (pós `applyVars`) já existe, `origem: 'boas_vindas'`.
- **`enviar-cobranca`**: mesmo padrão, no ponto onde a mensagem final já existe, `origem: 'cobranca'`.

`normalizePhone()` é duplicada em cada função hoje (padrão já existente no projeto) — a versão usada em `evo-resposta` é a fonte de verdade pro formato; as 3 funções de envio precisam da mesma normalização pro `telefone` bater com o que o inbound grava.

## 5. Classificação nas abas de conversa (Aluno / Lead Frio / Lead Quente)

Uma "conversa" = um `telefone` distinto com ≥1 linha em `whatsapp_mensagens`. Pra cada telefone, resolve a identidade (nome, turma/origem, categoria) nessa ordem de prioridade:

1. Casa o sufixo de 8 dígitos do telefone contra `leads_unificados`:
   - `origem_tabela = 'alunos'` → categoria **Aluno**, turma = nome real da turma (já vem pronto no campo `origem` da view, formato `"Aluno: <turma>"`, ou busca direta em `alunos.turma_id → turmas.nome`).
   - Senão, `temperatura IN ('quente', 'morno')` → categoria **Lead Quente**.
   - Senão (`frio`) → categoria **Lead Frio**.
   - Turma/rótulo pra não-aluno = campo `origem` da view (nome do lançamento/evento).
2. Sem match em `leads_unificados` → casa contra `disparo_leads` (mesmo sufixo) e usa `nome`/`temperatura` de lá com a mesma regra quente/morno→Quente, frio→Frio. Sem turma (rótulo vazio).
3. Sem match em lugar nenhum (telefone só tem mensagem inbound avulsa, nunca foi lead de nada) → não aparece na lista (não há categoria nem nome pra mostrar).

Nome exibido: o da tabela que deu o match (passo 1 ou 2). Se houver mais de um match (nome mudou entre cadastros, por exemplo), usa o mais recente por `criado_em`.

## 6. UI

- Novo item no menu de `DisparosMonitor` (`mainTab`): **"Chat"**, ícone `MessageCircle`, ao lado de Campanhas/Funil/Boas-vindas/Leads.
- **Painel esquerdo** (lista, ~320px fixo): 4 sub-abas Aluno/Lead Frio/Lead Quente/Cobrança (contador em cada), campo de busca por nome/telefone, lista ordenada pela mensagem mais recente primeiro — cada item mostra nome, turma/origem (texto pequeno), prévia da última mensagem truncada, horário relativo. Item selecionado fica destacado. (A aba Cobrança tem lista e painel próprios — ver seção 7.)
- **Painel direito** (thread): header com nome + turma + telefone mascarado; corpo com bolhas de mensagem — recebida alinhada à esquerda (cinza), enviada à direita (verde, estilo WhatsApp), agrupadas por dia com um separador de data no meio da lista; mensagens não-texto mostram ícone + rótulo (`🖼️ Imagem`, `🎵 Áudio`, etc, reaproveitando o mapeamento de tipo que `extractText()`/`TYPE_ICON` já definem). Sem campo de digitar/enviar (somente leitura).
- Estado vazio: painel direito mostra "Selecione uma conversa" até algo ser clicado.
- Tempo real: subscription em `whatsapp_mensagens` filtrada por `telefone` da conversa aberta atualiza a thread ao vivo; subscription sem filtro (ou por categoria visível) reordena a lista quando chega mensagem nova de qualquer conversa.

## 7. Aba Cobrança (carteira de alunos)

Diferente das outras 3 abas: não é uma lista de conversas, é a **carteira completa de alunos** — todos aparecem, tenham trocado mensagem ou não.

**Lista (painel esquerdo).** Um item por aluno de `alunos`, com nome, turma (via `turmas.nome`) e badge de situação:
- **Inadimplente** (vermelho) — tem ≥1 parcela inadimplente segundo `isPagamentoInadimplente` de `financial-utils.ts` (o mesmo critério canônico já usado por Dashboard/Financeiro/Cobranca: status `atrasado`, ou `pendente` com vencimento já passado). **Não** reimplementar a regra.
- **Em dia** (verde) — nenhuma parcela inadimplente.
- Alunos com `status` `cancelado`/`concluido` aparecem com rótulo próprio (cinza), sem cálculo de inadimplência.

Filtro rápido no topo (Todos / Em dia / Inadimplentes) e busca por nome. Ordenação: inadimplentes primeiro, depois alfabética.

**Painel direito.** Ao selecionar um aluno, mostra a conversa dele (mesma thread das outras abas — vazia com "Nenhuma mensagem ainda" se nunca trocou nada) e, no header, um botão **"Ficha de matrícula"** que abre `FichaAlunoResumo` em modal, sem sair do Chat.

**`FichaAlunoResumo` — ficha somente leitura.** Componente novo em `src/components/crm/finance/FichaAlunoResumo.tsx`. Recebe `alunoId` + `onClose`, busca os próprios dados (`alunos` + `turmas` + `pagamentos` daquele aluno) e mostra:

- **Cabeçalho**: nome, turma, status do aluno, badge de situação (mesma regra da lista).
- **Dados cadastrais**: WhatsApp, e-mail, CPF, data de nascimento, cidade/estado, origem do lead.
- **Financeiro**: forma de pagamento, valor da mensalidade, dia de vencimento, data de matrícula, progresso `mensalidades_pagas`/`total_mensalidades`, e a **lista de parcelas** (número, vencimento, valor, status) — apenas exibida, sem nenhum botão de ação.
- **Contrato**: os três marcos (forms respondido / contrato enviado / assinado) como indicadores, com as datas.
- **Rodapé**: botão **"Editar no Financeiro"**, que fecha o Chat e navega pra `financeiro_aluno_<id>` — o deep-link que já existe e já é usado pelo `Equipe11ds`. É o único caminho de escrita, e ele leva pra ficha completa de sempre.

O componente não tem nenhum `insert`/`update`/`delete`, nenhum campo editável e nenhum upload. Reaproveita `isPagamentoInadimplente` de `financial-utils.ts` pra situação e formata valores com o mesmo padrão pt-BR do resto do sistema.

**Navegação.** Pra `DisparosMonitor` conseguir navegar pro Financeiro, ele recebe uma prop opcional `onNavigateToAluno?: (alunoId: string) => void`, repassada pelo `CRMLayout` como `setCurrentView(\`financeiro_aluno_${id}\`)` — exatamente o mesmo padrão que o `Equipe11ds` já usa hoje (`CRMLayout.tsx:250`). Se a prop não vier, o botão simplesmente não aparece.

## 8. Testes/verificação

- Disparar uma campanha de teste, confirmar que a mensagem enviada aparece em `whatsapp_mensagens` com `origem='disparo'` e na thread do Chat.
- Simular uma resposta inbound (webhook de teste) pro mesmo telefone e confirmar que aparece do lado oposto da thread, em tempo real se o Chat estiver aberto na conversa.
- Conferir que um aluno matriculado aparece na aba Aluno com a turma certa, um lead com `temperatura='frio'` aparece em Lead Frio, e um lead `'quente'`/`'morno'` aparece em Lead Quente.
- Conferir que um telefone que só existe em `disparo_leads` (sem match em `leads_unificados`, ex: importado por CSV) ainda aparece corretamente classificado, sem turma.
- Conferir que um telefone sem nenhuma mensagem não aparece nas abas Aluno/Lead Frio/Lead Quente (mas aparece na aba Cobrança, se for aluno).
- Disparar uma mensagem de boas-vindas e uma de cobrança de teste e confirmar que ambas aparecem no histórico com a `origem` certa.

**Aba Cobrança e ficha resumida:**
- Conferir que a badge de situação bate com o que a tela de Cobrança/Financeiro já mostra pro mesmo aluno (inadimplente lá = inadimplente aqui).
- Abrir a ficha resumida de um aluno e comparar os dados com a ficha completa no Financeiro: parcelas (número, vencimento, valor, status), progresso de mensalidades, marcos do contrato.
- Conferir que a ficha resumida não oferece nenhuma ação de escrita, e que "Editar no Financeiro" abre a ficha completa do aluno certo.
- Conferir que aluno sem nenhuma parcela cadastrada não quebra a ficha (estado vazio).

**Garantia de não-regressão do financeiro:** `git diff` da entrega não pode conter nenhuma alteração em `Financeiro.tsx`, `Cobranca.tsx`, `financial-utils.ts` nem em migrations de `alunos`/`pagamentos`/`turmas`. Se aparecer, algo saiu do escopo combinado.
