# Chat de conversas (estilo WhatsApp) — design

Data: 2026-08-06
Componentes: `DisparosMonitor.tsx` (existente, novo mainTab), `leads_unificados` (existente, view), `disparo_leads`/`alunos`/`turmas` (existentes), `evo-resposta`/`disparo-runner`/`boas-vindas-enviar`/`enviar-cobranca` (existentes, ganham instrumentação), tabela nova: `whatsapp_mensagens`.

## 1. Estado atual (confirmado por investigação de código)

- Não existe histórico bidirecional de conversa em lugar nenhum do sistema hoje. O que existe é sempre "última mensagem", sobrescrita a cada evento novo:
  - `disparo_leads.ultima_resposta`/`respondeu_em`, `boas_vindas_logs.ultima_resposta`/`respondeu_em`, `cobranca_logs.ultima_resposta`/`respondeu_em` — todos sobrescritos pelo `evo-resposta` a cada mensagem inbound nova, pro telefone que casar.
  - `lead_respostas` guarda histórico inbound, mas só pra leads que batem com `lancamento_leads` — não cobre `disparo_leads`, `alunos` (cobrança) nem boas-vindas.
  - `cobranca_ia_mensagens` guarda histórico bidirecional completo, mas é exclusivo do fluxo de IA de cobrança (`cobranca-ia-responder`) — não é genérico.
- `evo-resposta/index.ts` já é o único ponto de entrada de toda mensagem inbound (webhook da Evolution API), com `normalizePhone()` (normaliza pra 11 dígitos BR) e matching por sufixo de 8 dígitos (`s8`) contra várias tabelas (`lancamento_leads`, `disparo_leads`, `boas_vindas_logs`, `cobranca_logs`). Esse é o padrão de matching que a tabela nova reaproveita.
- `leads_unificados` (view, `20260727100000_leads_unificados_view.sql`) já unifica `lancamento_leads`, `npa_evento_leads`, `alunos` (com turma via join com `turmas`) e `seu_numerologo_leads`, com `temperatura` calculada (`quente`/`morno`/`frio`) e `origem` (nome legível do lançamento/evento, ou `'Aluno: ' || turma.nome`).
- `disparo_leads` é um snapshot no momento da criação da campanha (`nome`, `phone`, `temperatura`) — não tem FK de volta pra `leads_unificados`. Leads importados por CSV ou grupo de WhatsApp só existem aqui, nunca aparecem em `leads_unificados`.
- Os 3 pontos de envio que vão alimentar o histórico (`disparo-runner`, `boas-vindas-enviar`, `enviar-cobranca`) já têm a mensagem final (com variáveis já aplicadas) disponível em uma variável local logo antes da chamada `fetch` pro endpoint `sendText` da Evolution API — não precisa reconstruir o template em lugar nenhum.

## 2. Escopo desta entrega (validado com o usuário)

- Universo de leads: todos do sistema (mesmo escopo de `leads_unificados`, mais os leads exclusivos de `disparo_leads` como fallback — CSV/grupo).
- Fontes de mensagem **enviada** que entram no histórico: campanhas de disparo, boas-vindas, cobrança.
- Somente leitura — sem responder pela tela do Chat nessa entrega.
- Fora de escopo agora: mensagens de sequência de funil (dia-a-dia agendado) como fonte de histórico, histórico anterior à data em que a instrumentação entrar no ar (não há backfill retroativo dos logs existentes).

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

## 5. Classificação em 3 abas (Aluno / Lead Frio / Lead Quente)

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
- **Painel esquerdo** (lista de conversas, ~320px fixo): 3 sub-abas Aluno/Lead Frio/Lead Quente (contador em cada), campo de busca por nome/telefone, lista ordenada pela mensagem mais recente primeiro — cada item mostra nome, turma/origem (texto pequeno), prévia da última mensagem truncada, horário relativo. Item selecionado fica destacado.
- **Painel direito** (thread): header com nome + turma + telefone mascarado; corpo com bolhas de mensagem — recebida alinhada à esquerda (cinza), enviada à direita (verde, estilo WhatsApp), agrupadas por dia com um separador de data no meio da lista; mensagens não-texto mostram ícone + rótulo (`🖼️ Imagem`, `🎵 Áudio`, etc, reaproveitando o mapeamento de tipo que `extractText()`/`TYPE_ICON` já definem). Sem campo de digitar/enviar (somente leitura).
- Estado vazio: painel direito mostra "Selecione uma conversa" até algo ser clicado.
- Tempo real: subscription em `whatsapp_mensagens` filtrada por `telefone` da conversa aberta atualiza a thread ao vivo; subscription sem filtro (ou por categoria visível) reordena a lista quando chega mensagem nova de qualquer conversa.

## 7. Testes/verificação

- Disparar uma campanha de teste, confirmar que a mensagem enviada aparece em `whatsapp_mensagens` com `origem='disparo'` e na thread do Chat.
- Simular uma resposta inbound (webhook de teste) pro mesmo telefone e confirmar que aparece do lado oposto da thread, em tempo real se o Chat estiver aberto na conversa.
- Conferir que um aluno matriculado aparece na aba Aluno com a turma certa, um lead com `temperatura='frio'` aparece em Lead Frio, e um lead `'quente'`/`'morno'` aparece em Lead Quente.
- Conferir que um telefone que só existe em `disparo_leads` (sem match em `leads_unificados`, ex: importado por CSV) ainda aparece corretamente classificado, sem turma.
- Conferir que um telefone sem nenhuma mensagem não aparece na lista.
- Disparar uma mensagem de boas-vindas e uma de cobrança de teste e confirmar que ambas aparecem no histórico com a `origem` certa.
