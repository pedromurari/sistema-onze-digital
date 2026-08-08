# Chat flutuante (estilo Facebook) — design

Data: 2026-08-08
Componentes: `ChatConversas.tsx` (existente, refatorado), novos: `useConversas.ts`, `useThread.ts`, `ChatWidget.tsx`, tabela `chat_leituras`.

## 1. Motivação

Hoje a conversa de WhatsApp só é visível dentro de Central de Disparos → Chat. Pra ver quem respondeu ou continuar uma conversa, o usuário precisa sair de qualquer tela em que esteja (Financeiro, Dashboard, etc.) e navegar até lá. O pedido é um acesso rápido tipo Facebook Messenger: uma bolha flutuante visível em qualquer tela, que abre um painel compacto sem trocar de aba.

## 2. Escopo (validado com o usuário)

- **Versão leve**, não a réplica completa da aba Chat: busca por nome/telefone + lista de conversas recentes (achatada, sem agrupar por turma/lançamento/NPA/disparo) + a thread da conversa selecionada. Sem aba Cobrança, sem filtro de temperatura.
- **Gatilho**: bolha circular flutuante no canto inferior direito, com badge de não lidas — em todas as telas, incluindo mobile.
- **Não lidas**: contador real (não é só um indicador manual), calculado por conversa.
- Fora de escopo: notificação push do navegador pra mensagem nova (isso é o tema do spec de 2026-08-05, não deste), abrir múltiplas conversas em janelas separadas (Facebook Web faz isso; aqui é só 1 painel, lista ↔ thread).

## 3. Extração dos hooks (sem mudar comportamento)

`ChatConversas.tsx` hoje mistura busca de dados com a UI da aba completa (categorias, Cobrança). Antes de construir o widget, extrai duas peças que os dois componentes (aba completa e widget) vão compartilhar — puro reposicionamento de código, sem alterar o que já funciona:

- **`useConversas()`** (`src/hooks/useConversas.ts`) — tira de `ChatConversas.tsx` a função `carregarConversas` inteira (query em `whatsapp_mensagens`, resolução de identidade por sufixo de telefone contra `leads_unificados`/`disparo_leads`/`disparo_campanhas`, ver comentário atual em `ChatConversas.tsx:195-227`) e a subscription realtime (`whatsapp_mensagens_lista`). Devolve `{ conversas, loading, refresh }`.
- **`useThread(telefone: string | null)`** (`src/hooks/useThread.ts`) — tira a função `carregarThread` e a subscription por telefone (`ChatConversas.tsx:330-351`). Devolve `{ thread, loading }`. Esse hook também é o ponto único que marca a conversa como lida (seção 5) — sempre que `telefone` muda e a thread carrega, grava `lida_em`. Widget e aba completa chamam o mesmo hook, então os dois ganham esse comportamento de graça e continuam consistentes entre si (ler numa não deixa a outra "esquecida" com o badge errado).

`ChatConversas.tsx` passa a chamar `useConversas()` e `useThread(selecionado?.telefone ?? null)` em vez da lógica inline. O componente fica menor; toda a UI de categorias/Cobrança continua exatamente como está.

## 4. `ChatWidget.tsx`

Montado uma vez em `CRMLayout.tsx`, como irmão de `MobileNav`/`LeadModal` (fora do `<main>` que troca por view) — ver `CRMLayout.tsx:268-286`. Visível em qualquer tela, com a mesma regra de permissão que a aba Chat já usa hoje (`permissions.canViewCobranca || isAdmin`, ver `CRMLayout.tsx:242-248`); se o usuário não tem essa permissão, o componente nem monta.

Dois estados:

- **Fechado**: círculo fixo (`fixed bottom-6 right-6 lg:bottom-6`, e `bottom-20` no mobile pra não cobrir o `MobileNav`), ícone de balão de mensagem, badge vermelho com a contagem de não lidas (mesmo estilo do badge do `NotificationBell.tsx`) quando > 0.
- **Aberto**: painel sobre o conteúdo atual.
  - Desktop/tablet (`lg:` e acima): caixa fixa de 340×480px ancorada no canto inferior direito, acima da bolha.
  - Mobile: quase tela cheia (`fixed inset-x-3 top-16 bottom-20`), pra não ficar um retângulo apertado numa tela pequena.
  - Conteúdo do painel: campo de busca no topo (filtra por nome/telefone, mesmo `q.trim().toLowerCase()` já usado em `ChatConversas.tsx`), lista de conversas de `useConversas()` ordenada por `ultimaEm` (sem agrupamento), e ao clicar numa conversa troca pra visualização da thread (`useThread`) com botão "← Voltar" no topo. Mesmo layout de bolha de mensagem (enviada/recebida, separador de dia, badge de instância) que a aba completa já tem, só que num espaço menor.
  - Sem botão de "Ficha de matrícula" (fora do escopo leve) — quem precisar disso abre a aba Chat completa.

## 5. Não lidas

Tabela nova:

```sql
CREATE TABLE public.chat_leituras (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telefone  TEXT NOT NULL,
  lida_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, telefone)
);
ALTER TABLE public.chat_leituras ENABLE ROW LEVEL SECURITY;
-- policy: usuário só vê/grava a própria linha (auth.uid() = user_id)
```

Mesmo conceito do `notifications.lida` que já existe (`NotificationBell.tsx`), mas por conversa em vez de por evento, e por isso precisa de uma tabela própria em vez de reaproveitar `notifications`.

- **Marcar como lida**: dentro de `useThread`, todo `useEffect` que dispara ao trocar `telefone` faz um `upsert` em `chat_leituras` com `lida_em = now()`. Best-effort (erro só loga, não bloqueia a UI) — mesmo padrão já usado em todo `registrarMensagemEnviada` do backend.
- **Calcular não lidas**: dentro de `useConversas`, depois de montar a lista de conversas, busca `chat_leituras` do usuário atual (`select telefone, lida_em where user_id = auth.uid()`) uma vez e cruza em memória. Uma conversa conta como não lida quando `direcao` da última mensagem é `'recebida'` **e** `ultimaEm > lida_em` daquele telefone (ou nunca foi lida). Mensagem que nós mandamos nunca gera badge, porque não é algo que precisa ser "lido" por quem está usando o CRM.
- O badge da bolha mostra a contagem de conversas nessa condição (não a contagem de mensagens) — mesmo padrão do sino de notificações.

## 6. Testes/verificação

Sem suíte automatizada no projeto (mesmo caso do resto do repo) — verificação manual no navegador:

- Abrir o widget em 3 telas diferentes (Financeiro, Dashboard, Leads) e confirmar que ele aparece igual nas três, sem precisar navegar até Central de Disparos.
- Mandar uma mensagem de teste (inbound) e confirmar que o badge incrementa sem precisar recarregar a página (realtime).
- Abrir a conversa no widget, confirmar que o badge zera, e confirmar que a aba Chat completa (Central de Disparos → Chat) também reflete como lida (e vice-versa: ler na aba completa zera o badge do widget).
- Testar em mobile (viewport estreito) que o painel não sobrepõe o `MobileNav` e que a bolha fica numa posição alcançável.
- Confirmar que um usuário sem `canViewCobranca`/admin não vê a bolha em nenhuma tela.
