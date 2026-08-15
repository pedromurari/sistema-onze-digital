# Aquecimento de Leads + isca por vendedor — design

Data: 2026-08-15
Componentes: novo módulo `AquecimentoLeads.tsx` (aba dentro de `DisparosMonitor.tsx`/"Central de Disparos"), novas tabelas, dois cron novos, extensão de `evo-resposta`, flag de desativação de `leads-ia-responder`/`leads-ia-followup`.

## 1. Contexto e motivação

A empresa contratou 3 vendedores. O atendimento deixa de ser feito pelo agente de IA (`leads-ia-responder`, ver [[sdr_leads_idm_agente]]) e passa a ser humano, mas antes de cair com um vendedor o lead passa por um **aquecimento**: uma sequência de 4 fases de conteúdo mandada pelos números da própria empresa, e só depois de "aquecido" (interagiu) é que uma mensagem de **isca** é mandada pelo número do vendedor designado, iniciando a conversa comercial humana.

Leads que entram nesse fluxo vêm da **base já existente** no CRM (não de leads novos do anúncio) — selecionados manualmente numa campanha, reaproveitando os filtros que já existem na aba "Leads" da Central de Disparos.

## 2. Decisões confirmadas com o usuário

- Cada um dos 3 vendedores tem WhatsApp próprio, conectado como instância Evolution API dedicada (vinculada ao usuário `tipo='vendedor'` já suportado no sistema).
- Origem dos leads: base existente, selecionada manualmente (não substitui o funil de leads novos do anúncio).
- Avanço entre fases: só por **engajamento** (lead responde/interage) — sem avanço automático por tempo.
- Sem engajamento: lead fica parado indefinidamente na fase atual (sem timeout, sem saída automática do fluxo).
- Conteúdo: 1 mensagem fixa por fase (texto/mídia), editável em painel — não é uma mini-sequência.
- Envio das 4 fases: rodízio entre os números ativos de disparo da empresa (mesmo pool que campanhas usam hoje, `evolution_config`).
- Atribuição de vendedor ao concluir a fase 4: rodízio automático entre os 3.
- Isca: automática, mas com delay de minutos (5–30min configurável) depois que o lead termina a fase 4.
- Pós-isca: 100% humano — o vendedor conduz a conversa manualmente, sem IA.
- SDR de IA (`leads-ia-responder` + `leads-ia-followup`): desativado por **flag**, código mantido intacto para religar no futuro.
- Arquitetura: módulo novo e dedicado (não estende Campanhas de Disparo nem o Funil), padrão planner+worker igual ao Aquecimento de Chips ([[aquecimento_chips]]), mas sem rampa — 4 fases fixas.

## 3. Modelo de dados

Migração nova: `supabase/migrations/20260815_aquecimento_leads.sql`

### `lead_aquecimento_fases`
Config das 4 fases, editável no painel (não há "campanha" por fase — é config global, igual `boas_vindas_config` hoje).
- `id`, `fase_numero` (1-4, unique), `nome` (label livre, ex.: "Fase 1 — Aquecimento inicial")
- `message_type` (`text`/`image`/`audio`/`video`/`document`), `mensagem_texto`, `media_url`
- `ativo` (permite pausar uma fase sem apagar — se pausada, leads acumulam parados nela)
- `updated_at`

### `lead_aquecimento_vendedores`
Vínculo vendedor ↔ instância própria.
- `id`, `usuario_id` (FK `users`/profiles, deve ter `tipo='vendedor'`), `evolution_config_id` (FK `evolution_config`), `ativo` (entra ou não no rodízio), `created_at`

### `lead_aquecimento_campanhas`
Lote de leads colocado no fluxo de uma vez.
- `id`, `nome`, `criado_por`, `criado_em`, `leads_total` (contagem denormalizada, atualizada no insert)

### `lead_aquecimento_leads`
1 linha por lead na campanha.
- `id`, `campanha_id` (FK), `nome`, `phone`, `origem_tabela`, `origem_id` (rastreio de onde veio, mesmo padrão de `leads_unificados`)
- `fase_atual` (1-4)
- `status`: `aguardando_envio_fase` | `aguardando_engajamento` | `aguardando_isca` | `isca_enviada` | `erro`
- `evolution_config_id_envio` (qual número da empresa mandou a fase atual — precisa bater no matching do webhook)
- `fase_enviada_em`, `respondeu_fase_em`
- `isca_agendada_para`, `isca_enviada_em`
- `vendedor_id` (FK `lead_aquecimento_vendedores`, setado só ao entrar em `aguardando_isca`)
- `error_msg`
- `criado_em`

Índices: `(status, isca_agendada_para)` pra cron da isca; `(phone)` pra matching do webhook; `(status)` pra cron de fase.

## 4. Fluxo passo a passo

1. **Criar campanha**: usuário filtra leads na aba Leads (reaproveita `LeadsTab`/`applyFilters` já existentes) ou sobe CSV, dá nome, confirma → insere em `lead_aquecimento_campanhas` + N linhas em `lead_aquecimento_leads` com `fase_atual=1`, `status='aguardando_envio_fase'`.
2. **Envio de fase** (`aquecimento-lead-enviar-fase`, cron a cada poucos minutos, e botão "Processar agora" manual): busca leads `aguardando_envio_fase`, para cada um pega a mensagem de `lead_aquecimento_fases` correspondente a `fase_atual`, escolhe o próximo número da empresa em rodízio (least-recently-used entre `evolution_config` ativos), envia via Evolution API direto (mesmo motivo do Aquecimento de Chips: não pode trocar de instância em caso de falha, senão perde a identidade do remetente que o lead vai responder) → grava `evolution_config_id_envio`, `fase_enviada_em`, `status='aguardando_engajamento'`. Falha de envio: mantém `aguardando_envio_fase`, grava `error_msg`, tenta de novo no próximo ciclo.
3. **Engajamento** (extensão em `evo-resposta`): novo branch, roda para mensagens recebidas em instâncias que também aparecem em `evolution_config_id_envio` de leads `aguardando_engajamento`. Faz matching por telefone (últimos 8 dígitos, mesmo padrão já usado no resto do arquivo) + instância. Ao achar:
   - grava `respondeu_fase_em = now()`
   - se `fase_atual < 4`: `fase_atual += 1`, `status='aguardando_envio_fase'` (pega a próxima mensagem no próximo ciclo do cron de fase)
   - se `fase_atual == 4`: `status='aguardando_isca'`, `isca_agendada_para = now() + random(5,30) minutos`
4. **Isca** (`aquecimento-lead-enviar-isca`, cron a cada 1-2min): busca `status='aguardando_isca'` e `isca_agendada_para <= now()`. Escolhe vendedor em rodízio entre `lead_aquecimento_vendedores` ativos, envia mensagem de isca (texto configurável, único — não por fase) pela instância do vendedor escolhido → grava `vendedor_id`, `isca_enviada_em`, `status='isca_enviada'`. Falha: mantém `aguardando_isca`, tenta de novo no próximo ciclo.
5. **Pós-isca**: sistema não faz mais nada com esse lead — conversa 100% no WhatsApp do vendedor, fora do CRM (a não ser que o vendedor use o Chat existente, que já funciona por instância independente do fluxo de aquecimento).

## 5. Desativação do SDR de IA

Tabela nova `leads_ia_config` (singleton, 1 linha):
- `id`, `ativo boolean default true`, `updated_at`

Pontos de checagem (leitura simples no início, mesmo padrão de early-return já usado no arquivo):
- `evo-resposta` → `tentarCriarLeadDireto`: se `leads_ia_config.ativo === false`, retorna `null` imediatamente (sem criar lead Direto nem rotear pro SDR) — mensagem cai no matching genérico do resto do webhook, comportamento normal de webhook sem SDR.
- `leads-ia-followup` (cron): checa a flag no início da execução; se desativado, retorna sem processar nada (nenhuma cutucada de silêncio, nenhum lembrete de handoff).

UI: switch "Ativo" na ficha do agente `sdr-leads-idm` em `Equipe11ds.tsx`, ligado a essa tabela. Nenhuma function é deletada, nenhum cron é cancelado — só param de agir.

## 6. Frontend

Nova aba **"Aquecimento de Leads"** em `DisparosMonitor.tsx` (`mainTab`), ícone tipo `Flame`/`Users`.

- **Lista de campanhas**: nome, total de leads, contagem por status (aguardando fase X / aguardando engajamento / aguardando isca / isca enviada), botão "Nova campanha" (reaproveita seleção de leads da aba Leads existente ou CSV — mesmo componente/fluxo do `NovaCampanhaModal` hoje usado em Campanhas de Disparo, adaptado).
- **Detalhe da campanha**: tabela dos leads com fase atual, status, vendedor designado (quando aplicável), datas relevantes. Sem Kanban nessa primeira entrega (fora de escopo — pode vir depois, seguindo o padrão de [[kanban dentro de campanha]] se fizer sentido).
- **Config** (sub-aba ou modal): editar as 4 mensagens de fase (texto/mídia), editar texto da isca, faixa de delay (min/max minutos), gerenciar vínculo vendedor↔instância (lista de usuários `tipo='vendedor'` com select de instância Evolution + toggle ativo).

## 7. Erros e edge cases

- Vendedor sem instância vinculada ou instância inativa: rodízio da isca pula ele (só considera `lead_aquecimento_vendedores.ativo=true` com instância válida); se nenhum vendedor ativo, lead fica em `aguardando_isca` até alguém ativar um.
- Número da empresa desconectado durante rodízio de fase: mesma lógica — pula pro próximo ativo; se nenhum ativo, lead fica parado em `aguardando_envio_fase` com `error_msg`.
- Lead responde numa instância diferente da que mandou (ex.: trocou de número): não gera match — fica em `aguardando_engajamento` até responder na instância certa. Comportamento aceito (mesmo risco já existe hoje em outros fluxos de resposta por instância).
- Mesmo telefone em duas campanhas de aquecimento simultâneas: fora de escopo evitar — comportamento não definido/indesejado, mas não teve pedido explícito de trava; pode ser endereçado depois se acontecer na prática.

## 8. Testes/verificação

- Criar campanha de teste com 1-2 leads reais de teste (nome "TESTE..." se quiser reaproveitar o padrão de modo teste do resto do sistema — a definir na implementação se aplica aqui).
- Rodar `aquecimento-lead-enviar-fase` manualmente ("Processar agora"), confirmar envio da fase 1 e mudança de status.
- Simular resposta via payload de teste no `evo-resposta` (mesmo método usado em [[sdr_leads_idm_agente]] — arquivo/`--data-binary`, não inline), confirmar avanço de fase até a 4, depois `aguardando_isca`.
- Confirmar `isca_agendada_para` dentro da faixa configurada e que o cron da isca só dispara depois desse horário.
- Confirmar rodízio: várias fases/campanhas passando por todos os números ativos e todos os vendedores ativos de forma equilibrada.
- Desativar a flag `leads_ia_config.ativo`, confirmar que `evo-resposta` não cria mais lead Direto/aciona SDR e que `leads-ia-followup` não processa nada; reativar e confirmar volta ao normal.
