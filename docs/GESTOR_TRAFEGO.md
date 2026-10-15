# Gestor de Tráfego — automação de Meta Ads / Google Ads

Documento de trabalho (técnico) do Gestor de Tráfego: o "clone mental" do Pedro
pra tocar o dia a dia de tráfego pago sem ele precisar abrir o Ads Manager toda
hora. Vive no repo, cresce a cada fase entregue.

> Criado: 2026-10-12 · Repo: `onze-digital-main` · Supabase: `usqiyekfmwwnvkmkdlej`

---

## 1. Ponto de partida — o que já existe (não é do zero)

Antes de desenhar qualquer coisa nova, o que já está em produção:

- **`src/components/crm/MetaAdsPanel.tsx`** — tela dentro do CRM que lista campanhas
  do Meta Ads (nome, gasto em R$, cliques, CTR, compras, leads, custo por lead) e
  já tem um botão de pausar/ativar campanha.
- **Edge Function `meta-ads`** (Supabase, ativa) — chama a **Graph API oficial da
  Meta (v21.0) direto via REST**, sem MCP, usando um token de sistema (System User
  do Business Manager) guardado em secret (`META_MARKETING_ACCESS_TOKEN` +
  `META_ADS_ACCOUNT_ID`), nunca exposto ao navegador. Ações hoje: `listar` (campanhas
  + insights de N dias) e `atualizar_status` (pausar/ativar).
- Ou seja: **a parte mais sensível — autenticação oficial com a Meta e visibilidade
  das campanhas — já está pronta e funcionando.** O trabalho novo é: automatizar
  decisão (regras), abrir um segundo canal de interação (Telegram) e fechar o ciclo
  criativo (Drive → campanha no ar).
- **Alerta de custo por lead** já existe na tela, mas é só visual (R$30 fixo,
  hardcoded, não dispara nenhuma ação). Vira a base da Fase 1.

Essa confirmação também responde a sua pergunta sobre risco de banimento: como o
que já roda (e o que vamos adicionar) usa sempre a API oficial com token de
sistema — nunca automação por navegador ou cookie de sessão — o risco de bloqueio
de conta não muda, com ou sem MCP. MCP é só uma camada de protocolo por cima do
mesmo endpoint oficial; não muda o que a Meta vê chegando.

---

## 2. Como as peças se conectam

```
Você (Telegram) ──► n8n (Hostinger, já pago) ──► Claude API (pergunta/contexto)
                                │
                                ├──► Edge Function meta-ads (ação: pausar, orçamento)
                                │        │
                                │        └──► Graph API oficial da Meta (token de sistema)
                                │
                                └──► cron interno (regra automática, roda sozinho,
                                     sem IA, a cada N min: lê métricas → decide → age)

Google Drive (pasta por campanha) ──► n8n (watcher) ──► Meta (sobe criativo) / você (aviso)

Claude Code (eu) ──► tarefa agendada diária/semanal: revisão de resultado,
                     sugestão de ajuste, relatório — trabalho que exige julgamento,
                     não regra fixa.
```

Três camadas, cada uma fazendo só o que ela faz bem:

1. **Regra automática (sem IA)** — n8n chama a Graph API / a edge function `meta-ads`
   direto, em horário fixo. Rápido, previsível, auditável. É pra decisão binária
   ("CPL > X → pausa").
2. **Telegram + Claude API** — n8n recebe sua mensagem, manda pro Claude API (uma
   chamada avulsa, com um resumo do contexto do negócio anexado) e devolve a
   resposta. É pra pergunta rápida / comando do tipo "como tá a campanha X hoje?".
3. **Eu (Claude Code, sessão agendada)** — trabalho que precisa de julgamento e
   memória real do negócio: revisão semanal, decisão de realocar orçamento entre
   campanhas, redigir um relatório pra você. Não é tempo real, é checagem agendada.

---

## 3. Fases

### Fase 1 — Regras automáticas de pausa/orçamento (extensão da `meta-ads`)

- Nova tabela `trafego_regras`: campanha (ou "todas"), métrica (`custo_por_lead`,
  `cpa`, `gasto_diario`), limite, ação (`pausar`, `reduzir_orcamento_x%`,
  `aumentar_orcamento_x%`), ativa/inativa.
- Nova ação na edge function `meta-ads`: `atualizar_orcamento` (hoje só existe
  pausar/ativar; falta setar `daily_budget`).
- Tabela `trafego_log_acoes`: toda ação automática fica registrada (campanha,
  regra disparada, valores antes/depois, quando) — você precisa conseguir ver
  **por que** uma campanha foi pausada sem precisar me perguntar.
- Execução: `pg_cron` no Supabase (ou um workflow n8n com timer) rodando a cada
  15–30 min, lendo `trafego_regras` + insights atuais e chamando a própria edge
  function `meta-ads`.
- Native no painel: trocar o alerta visual fixo de R$30 por essas regras reais,
  e mostrar o log de ações automáticas na tela.

### Fase 2 — Telegram (consulta e comando rápido)

- Bot novo no Telegram (ou reaproveitar um existente, se você já tiver).
- Workflow n8n: webhook do Telegram → se for pergunta, chama Claude API com um
  resumo do estado atual (campanhas ativas, gasto do dia, regras disparadas
  recentemente) injetado no prompt → responde. Se for comando direto ("pausa a
  campanha X", "sobe orçamento da Y"), n8n chama a edge function `meta-ads` direto,
  sem precisar de IA no meio.
- Fica a seu critério no detalhamento: confirmar antes de agir ou agir e avisar.
  Dado que mexe com dinheiro real, recomendo **confirmar antes de qualquer ação
  que gaste mais** (aumento de orçamento) e **agir e avisar depois** nas que
  protegem dinheiro (pausar por CPL alto).

### Fase 3 — Google Drive → criativo no ar

- Maior peça nova, nenhuma base hoje. Precisa de: Google Drive API (service
  account ou OAuth), estrutura de pasta por campanha (convenção a definir —
  ver seção 5), watcher n8n (ou trigger nativo do Drive) que detecta upload novo,
  sobe o criativo pra Meta (endpoint de ad creative) e cria o anúncio dentro da
  campanha certa.
- Esta fase assume que a campanha **já existe** no Meta (criada por você ou por
  mim) — o escopo aqui é "trocar/adicionar criativo", não "criar campanha do
  zero a partir de uma pasta". Criar campanha nova do zero por automação é
  sensível (estrutura, objetivo, público) — fica como trabalho de julgamento
  (camada 3), não regra automática.

### Fase 4 — Revisão agendada (camada "Claude Code")

- Tarefa agendada (diária ou semanal, a definir) onde eu reviso os números,
  cruzo com o histórico de ações automáticas, e te mando um resumo — via
  Telegram ou aqui mesmo — com recomendação (realocar orçamento, pausar algo
  que a regra não pegou, etc.). Isso é o "julgamento" que uma regra fixa não
  cobre.

### Fase 5 — Google Ads (se entrar no escopo)

- Hoje só Meta tem base pronta. Google Ads não tem MCP oficial e exige
  **developer token vinculado a um projeto no Google Cloud com verificação de
  marca** — isso só pode ser pedido por você (dono da conta), não por mim.
  Proponho tratar isso como fase separada, só depois da Fase 1–2 do Meta
  estarem rodando e provadas.

---

## 4. Ordem sugerida

**1 → 2 → 4 → 3 → 5.** Regra automática primeiro (protege dinheiro sem
depender de você estar disponível), Telegram em seguida (você ganha visibilidade
e controle remoto), revisão agendada depois (eu entro como camada de julgamento),
Drive por último (é a peça mais nova e mais cara de construir), Google Ads só se
e quando você decidir entrar nesse canal.

---

## 5. O que eu preciso de você

- [ ] **Confirmar os números das regras da Fase 1**: qual custo por lead é
  "ruim" (hoje é R$30 fixo, só visual — precisa virar valor real por campanha
  ou produto), e se existe um valor de CPL "bom" que deveria **aumentar**
  orçamento automaticamente, ou se por enquanto só quer a trava de baixo
  (pausar) e deixar o aumento manual/por julgamento.
- [ ] **Confirmar quais campanhas/conta(s) de anúncio entram** no escopo das
  regras automáticas (todas, ou só algumas específicas pra começar).
- [ ] **Criar o bot do Telegram** (é rápido, 2 min no app do Telegram com o
  @BotFather) e me passar o token — ou eu te guio passo a passo na hora.
- [ ] **Decidir a política de confirmação**: aumento de orçamento pede sua
  confirmação antes, sempre? Ou até um teto automático (ex: até R$50/dia sem
  perguntar, acima disso avisa e espera)?
- [ ] **Fase 3 (Drive):** definir a convenção de pasta (uma pasta por campanha?
  por produto? nome de pasta = nome exato da campanha no Meta?) — isso eu
  posso propor uma sugestão, mas a estrutura final é sua decisão de operação.
- [ ] **Google Ads (Fase 5):** só se você quiser esse canal — nesse caso, a
  verificação de marca no Google Cloud precisa ser pedida por você (sou só
  colaborador do projeto depois de criado, não posso abrir a verificação).
- [ ] Confirmar que posso usar o n8n que já está rodando no seu Hostinger
  (`idm-n8n.nzj83i.easypanel.host`) pra esse fluxo, e se você quer acesso
  separado (login próprio) pra mim configurar os workflows lá.

Pode responder só o essencial pra começar (regras da Fase 1 + token do bot do
Telegram) e eu já coloco a Fase 1 e 2 de pé; o resto (Drive, Google Ads) a gente
refina quando chegar a vez.

---

## 6. Decisões já travadas (não reabrir sem o Pedro)

- **Sem MCP na camada de regra automática.** Chamada direta à Graph API /
  edge function `meta-ads`, que é o padrão que já existe e funciona.
- **Sem automação por navegador/cookie de sessão em nenhuma fase.** Só API
  oficial com token de sistema — é o que mantém o risco de banimento igual a
  zero (o risco histórico vem de automação não-oficial, não do uso correto da
  API).
- **Toda ação automática fica logada** (`trafego_log_acoes`) — nenhuma pausa
  ou mudança de orçamento acontece "no escuro".
