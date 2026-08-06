# Notificações: sino + push do navegador — design

Data: 2026-08-05
Componentes: `notifications` (existente), `NotificationBell.tsx` (existente), `enviar-cobranca`, `evo-resposta`, `Pipeline.tsx`, novos: `push_subscriptions`, service worker, edge function `push-enviar`.

## 1. Estado atual (confirmado por investigação de código)

A infraestrutura de notificação **já existe e funciona**, mas está subutilizada:

- `src/components/crm/NotificationBell.tsx` — sino no header, badge de não lidas, "marcar tudo como lido", subscrito em tempo real (`supabase.channel('notifications-realtime').on('postgres_changes', {event:'INSERT', table:'notifications'})`).
- Tabela `notifications` (`id, user_id, tipo, titulo, descricao, link, lida, created_at`), RLS por usuário, já na publicação `supabase_realtime`.
- O `iconMap` do sino já sabe desenhar `tarefa_criada`, `tarefa_atrasada`, `handoff_rodrygo`, `lead_quente` — mas só 2 lugares no código inserem notificação hoje:
  1. `Pipeline.tsx` (handoff pro Rodrygo, tipo `handoff_rodrygo`) — **bug real**: insere `user_id: user.id` (quem está logado) em vez do id do Rodrygo, então a notificação vai pra pessoa errada.
  2. `TarefasView.tsx` (`notificarColaborador`, tipo `etapa_desbloqueada`).
- Não existe push do navegador, WhatsApp/e-mail como canal, nem helper genérico de criação de notificação (cada call site duplica o insert manualmente).

## 2. Escopo desta entrega (validado com o usuário)

- **Eventos**: cobrança com problema (automação pausada por erro sequencial, instância do WhatsApp desconectada) + resposta de lead/aluno no WhatsApp.
- **Destinatários**: todos os usuários com papel admin.
- **Canais**: sino (já existe, só falta ligar os eventos) + push do navegador (novo).
- Fora de escopo agora: WhatsApp/e-mail como canal de notificação, tipos `lead_quente`/`tarefa_criada`/`tarefa_atrasada` (já existem no sino, ninguém pediu ligar agora), tela de preferências por pessoa.

## 3. Consolidar a criação de notificação

Duas funções SQL novas substituem os inserts manuais espalhados pelo código:

- `notificar(p_user_id uuid, p_tipo text, p_titulo text, p_descricao text, p_link text)` — insere 1 notificação pra 1 destinatário. `Pipeline.tsx` passa a usar essa função buscando o `user_id` real do Rodrygo (corrige o bug do handoff) em vez de inserir direto na tabela com o id errado.
- `notificar_admins(p_tipo text, p_titulo text, p_descricao text, p_link text)` — busca `profiles.id` onde `role = 'admin'` (confirmado: é a coluna e o valor literal já usados hoje pra distinguir admin/editor/viewer) e chama `notificar` pra cada um. É essa que os dois eventos novos (cobrança e resposta) usam. Hoje existe 1 admin só (o próprio usuário) — a função já fica pronta pra quando houver mais.

Ambas `SECURITY DEFINER` (rodam com privilégio pra inserir notificação pra outro usuário, já que RLS de `notifications` só permite ver/atualizar a própria linha) mas com `search_path` fixo, seguindo o padrão de segurança já usado nas outras funções `SECURITY DEFINER` do projeto.

## 4. Push do navegador (Web Push)

Infraestrutura nova, do zero — nada disso existe hoje:

- **Tabela `push_subscriptions`**: `id, user_id, endpoint, p256dh, auth, created_at`, RLS por usuário (cada um gerencia as próprias inscrições). Um usuário pode ter várias linhas (um navegador/dispositivo por linha).
- **Chave VAPID**: par público/privado gerado uma vez. Privada vira secret do Supabase (`VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT=mailto:...`); a pública também vai pro frontend via `VITE_VAPID_PUBLIC_KEY` (mesmo padrão de `VITE_SUPABASE_URL`).
- **Service worker** (`public/sw.js`): escuta o evento `push`, chama `self.registration.showNotification(titulo, {body, icon, data:{link}})`; escuta `notificationclick` pra abrir/focar a aba no `link` da notificação.
- **Opt-in**: botão "Ativar notificações no navegador" dentro do dropdown do sino. Ao clicar: pede permissão (`Notification.requestPermission()`), registra o service worker, assina push (`pushManager.subscribe({userVisibleOnly:true, applicationServerKey: VITE_VAPID_PUBLIC_KEY})`), salva a inscrição em `push_subscriptions`. Se o usuário já negou/ativou antes, o botão reflete o estado atual.

## 5. Disparo automático do push

Trigger `AFTER INSERT ON notifications` chama (via `net.http_post`, mesmo mecanismo já usado pelo pg_cron da cobrança) a edge function nova `push-enviar`, passando o `user_id` e os dados da notificação. A função busca todas as `push_subscriptions` daquele usuário e manda o Web Push (biblioteca `web-push` via `esm.sh`, assinado com a VAPID privada) pra cada uma; inscrições que retornam 404/410 (expiradas) são removidas da tabela.

Vantagem de usar trigger em vez de cada call site chamar a edge function: **qualquer** notificação futura (inclusive as que já existem hoje, como handoff e etapa desbloqueada) passa a ter push automaticamente, sem precisar lembrar de conectar os dois lados toda vez que um novo tipo for criado.

## 6. Onde plugar os dois eventos novos

- **Cobrança com problema** — dentro de `supabase/functions/enviar-cobranca/index.ts`, nos pontos que já setam `pausado_por_erro: true`: instância desconectada (`processarTick`, "Nenhuma instância conectada") e limite de erros sequenciais atingido. Chama `notificar_admins('cobranca_pausada', titulo, descricao, '/cobranca')` via `db.rpc`.
- **Resposta de lead/aluno no WhatsApp** — dentro de `supabase/functions/evo-resposta/index.ts`, que já é o único ponto de entrada de toda resposta inbound (webhook da Evolution API), cobrindo tanto `cobranca_logs` (linha ~430) quanto `lead_respostas`/`disparo_leads`/`leads` (linhas ~354-438) dependendo de onde o telefone bate. Chama `notificar_admins('lead_respondeu', titulo, descricao, link)` uma vez, depois de identificado a quem a resposta pertence.

## 7. Frontend

- `iconMap` do `NotificationBell.tsx` ganha entradas pra `cobranca_pausada` e `lead_respondeu`.
- Botão de ativar push (seção 4) fica dentro do próprio dropdown do sino, não numa tela nova.
- `Pipeline.tsx`: troca o insert manual (com o bug) pela chamada a `notificar`.

## 8. Testes/verificação

- Verificar no navegador: ativar push, forçar os dois eventos (ex: desconectar uma instância de teste, responder uma mensagem de teste) e confirmar que a notificação chega tanto no sino quanto como push do SO.
- Conferir que inscrições expiradas são removidas automaticamente (simular um endpoint inválido).
- Conferir que `Pipeline.tsx` agora notifica o Rodrygo de verdade, não quem estava logado.
