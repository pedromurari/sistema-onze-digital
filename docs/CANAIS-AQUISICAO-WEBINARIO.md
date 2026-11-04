# Canais de Aquisição — Webinário Evergreen

Documento de trabalho pra qualquer agente (Claude ou Codex) continuar o
projeto sem duplicar decisão já tomada. Este chat foi dedicado pelo Pedro ao
**departamento de Canais de Aquisição** em 2026-10-23 (antes era só Semana
do Despertar) — ver também `docs/GESTOR_TRAFEGO.md` (Meta Ads, mesmo
departamento, frente diferente).

> Criado: 2026-10-24 · Repo: `onze-digital-main` · Supabase: `usqiyekfmwwnvkmkdlej` ("Plataforma 11ds", produção)

---

## Objetivo

Portar o sistema de webinário evergreen standalone (`E:\webnar-idm`, nunca
rodou em produção, parado desde 08/06/2026) pra dentro deste CRM, como um
novo **canal de aquisição**, no mesmo padrão de "IDM Pelo Brasil" (NPA) e
"Semana do Despertar" — não é app separado, vive na mesma base/menu/permissão.

**Ler antes de mexer:** `E:\webnar-idm\CLAUDE.md` (regras de negócio
originais: grade de sessões, funil `watch_stage`, leads repetidos) e
`AGENTS.md` deste repo (convenção RLS/GRANT/`tem_permissao`).

## Escopo

Só Psicanálise Integrativa (produto `5b249002-ce8c-4836-8d4d-6f6f3b2d376c`
em `produtos`, já existe, reutilizar). Descartar o seed de numerologia do
protótipo original.

## Decisões já tomadas (não reabrir sem motivo novo)

1. **Lead único:** o webinário usa `leads` + `pessoas`/`pessoa_identificadores`
   existentes (dedupe por telefone/e-mail/CPF via `resolver_pessoa`), **não**
   cria uma tabela de "registrations" isolada.
2. **Vídeo:** hospedado no **Cloudflare R2** (não Bunny.net, não YouTube).
   Motivo: R2 não cobra banda de saída (R$0 sempre, não importa o volume
   assistido) — Bunny cobra por GB entregue (ficaria R$185-1.855/mês
   dependendo do volume); YouTube foi descartado porque não pode parecer
   que é YouTube. R2 é storage puro (sem bitrate adaptativo automático),
   mas isso bate com o MVP já decidido: `<video>` com URL direta, sem seek
   (igual ao protótipo original, que já bloqueava seek via CSS).
   **Concluído em 2026-10-24:** conta Cloudflare criada, plano gratuito do
   R2 assinado, bucket `idm-webinarios` criado via API (conta
   `f67d9fd287b6eb59607f3f4c47103966`), domínio público ativado
   (`pub-da74b2ec5ddf4847a6f20dec2e542925.r2.dev`), testado com upload real
   (200 OK). Token de API (`Admin Read & Write`, "R2 Account Token") gerado
   pelo Pedro e usado só nesta sessão — **não está guardado no repo**;
   precisa ser configurado como secret da Edge Function antes de usar em
   produção (ver "Próximo passo imediato").
3. **Pagamento:** CTA da oferta leva pro fluxo de matrícula **já existente**
   (`matricula-pagamento-criar`, Asaas/Mercado Pago) — nenhum webhook novo.
4. **WhatsApp/E-mail:** reaproveita `evolution_config`/`wpp-enviar`/
   `email-enviar`/`email_config`, respeitando `whatsapp_opt_out`. Não
   reescrever envio do zero.
5. **Funil de Kanban do lead (pedido explícito do Pedro, 2026-10-23):**
   - **Cadastro** → cai assim que o lead se cadastra na página pública.
   - **Entrou na aula** → `watch_stage` chegou em `entered`.
   - **Interessado** → `watch_stage` chegou em `cta_seen`/`offer_clicked`
     (assistiu X%, chegou no pitch). **Nesse momento** o lead recebe
     `leads.status = 'interessado'` (valor que já existe no enum) e é
     atribuído a um vendedor via `time_comercial_rodizio` (mesmo rodízio
     que já serve a Helen) — ou seja, a partir daqui ele cai automaticamente
     no funil comercial que a Helen já usa hoje (`primeiro_contato →
     proposta → retorno → perdido/fechado`), sem criar nada novo pra essa
     parte. As 3 primeiras etapas (Cadastro/Entrou/Interessado) são um
     quadro Kanban próprio do webinário (`kanban_colunas.webinario_id`,
     mesmo padrão de `npa_evento_id`/`aula_secreta_evento_id`).
   - Gatilho exato de "chegou no pitch" ainda não confirmado com o Pedro
     (perguntei: no segundo exato da oferta, ou já quando entra na sala? —
     resposta implícita foi "assistiu X%, chegou no pitch" = `cta_seen`,
     mas vale confirmar o % exato quando desenhar a tela de config do
     webinário).
6. **Vendedora de referência:** Helen Magna (login `helenmagnapessoal@gmail.com`,
   papel `vendedor`, instância WhatsApp "Helen vendas" em `evolution_config`).
   Pedro às vezes fala "Ellen" por engano (erro de ditado por voz) — é a
   mesma pessoa.

## Estado atual (2026-10-24)

- ✅ Mapeamento feito: `Sidebar.tsx` (`BASE_MENU`, `SECTION_BEFORE['lancamentos_legado'] = 'Canais de Aquisição'`),
  `access-control.ts` (`AppView`, `canAccessView`), `app_recursos`/`role_permissoes`,
  `kanban_colunas` (campos `npa_evento_id`/`aula_secreta_evento_id`/`leads_quadro_id`),
  `leads` (já tem `pessoa_id`, `campanha_id`, `canal`, `origem`, `status`).
- ✅ Migration **desenhada** (arquivo local, criado, **NÃO aplicada ainda**):
  `supabase/migrations/20261024000000_webinario_evergreen.sql` — cria
  `webinarios`, `webinario_sessoes`, `webinario_mensagens_chat`,
  `webinario_tracking`, coluna `kanban_colunas.webinario_id`, linha em
  `app_recursos` (chave `webinario`, módulo `Eventos`). RLS/GRANT no mesmo
  padrão de `npa_eventos`.
- ✅ Bucket R2 criado e testado (ver acima).
- ⏳ **Próximo passo imediato:** aplicar a migration (aguardando confirmação
  final do Pedro) e configurar as credenciais R2 (Access Key ID/Secret/
  endpoint/bucket) como secret das Edge Functions que vão subir vídeo
  (nunca no frontend/repo).
- ⚪ Não iniciado: seed do quadro Kanban (3 colunas), edge functions
  (`webinario-registrar`, `webinario-track`, `webinario-sessoes-cron`,
  `webinario-followup-cron`), páginas públicas (captura/obrigado/sala/oferta),
  item de menu + tela interna (overview, lista de leads, config do webinário).
- ⚪ Fora de escopo nesta fase (deixar só TODO): otimização autônoma por IA
  (Claude API semanal) e integração direta com Meta Ads (fica pro Gestor de
  Tráfego, `docs/GESTOR_TRAFEGO.md`, não duplicar aqui).

## Regras de trabalho (pedido explícito do Pedro)

- Produção com dado real (~250 alunos, ~2.900 pagamentos, ~12 mil leads) —
  **só migration aditiva**, nunca alterar/dropar tabela existente.
- Mostrar cada migration pro Pedro antes de aplicar.
- Não commitar sem ele pedir. Não copiar segredo pro repo.
- Depois de aplicar migration: rodar `get_advisors` (segurança/RLS) e
  corrigir o que aparecer.
- Testar o fluxo ponta a ponta antes de dar como pronto: cadastro →
  obrigado/countdown → sala → heartbeat/tracking → CTA → checkout existente
  → venda atribuída no painel → follow-up WhatsApp/e-mail.
- Ao terminar cada etapa, reportar em português simples o que ficou pronto
  e o que falta — sem jargão técnico desnecessário, é assim que o Pedro
  gosta de acompanhar.
