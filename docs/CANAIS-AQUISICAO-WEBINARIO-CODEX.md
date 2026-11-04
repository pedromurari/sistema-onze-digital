# Handoff para o Codex — Webinário Evergreen (tela interna do CRM)

Você (Codex) vai terminar a parte interna do novo canal de aquisição
"Webinário". **Leia `docs/CANAIS-AQUISICAO-WEBINARIO.md` primeiro** — lá
está todo o contexto, as decisões já travadas com o Pedro e o estado atual.
Aqui é só a sua fatia específica.

---

## O que já está pronto (não mexer, só consumir)

- **Banco:** migration `20261024000000_webinario_evergreen.sql` aplicada em
  produção. Tabelas `webinarios`, `webinario_sessoes`,
  `webinario_mensagens_chat`, `webinario_tracking`, coluna
  `kanban_colunas.webinario_id`, linha em `app_recursos` (chave
  `webinario`, módulo `Eventos`, rótulo "Webinário").
- **Edge functions ativas** (Supabase, projeto `usqiyekfmwwnvkmkdlej`):
  `webinario-registrar` (cadastro), `webinario-track` (enter/heartbeat/
  cta/offer), `webinario-sessoes-cron` (grade 30/30min 06h-23h BRT, roda
  sozinho todo dia às 6h).
- **Páginas públicas** (já no ar, mobile-first):
  `src/pages/webinario/WebinarioCaptura.tsx`,
  `WebinarioObrigado.tsx`, `WebinarioSala.tsx`, `WebinarioOferta.tsx` +
  `webinario.css`. Rotas em `App.tsx`: `/webinario/:slug`,
  `/webinario/obrigado/:slug`, `/webinario/sala/:sessionId`,
  `/webinario/oferta/:slug`.
- **Funil de leads:** lead entra em `leads` (canal='webinario'), avança
  `webinario_tracking.watch_stage` (registered → entered → watched_25/50/75
  → completed → cta_seen → offer_clicked). Ao cruzar `cta_seen`, o backend
  já faz o handoff sozinho: `leads.status='interessado'` + atribuição de
  vendedor via `time_comercial_proximo_indice('Webinario', ...)` (hoje só
  a Helen Magna, mesma lista de `time-comercial-atribuir-vendedor`).
- **Webinário seed:** 1 registro em `webinarios` (slug `psicanalise`,
  produto Psicanálise Integrativa), vídeo de placeholder no R2 (Pedro vai
  trocar pela gravação real do webinário depois — não é o VSL de vendas).
- Testei o fluxo completo manualmente via curl (cadastro → entrar →
  assistir 50% → pitch → handoff) e funcionou ponta a ponta.

## O que falta (sua tarefa)

### TAREFA W1 — Item de menu + roteamento interno (prioridade alta)
Em `src/components/crm/Sidebar.tsx`: adicionar `{ key: 'webinario', label:
'Webinário', icon: <escolha um ícone lucide-react coerente, ex: Video ou
Radio> }` no `BASE_MENU`, **na seção "Canais de Aquisição"** (mesmo grupo
de `lancamentos_legado`/`npa_dinamico` — ver `SECTION_BEFORE` no mesmo
arquivo, já tem a entrada do grupo, só falta o item).

Em `src/lib/access-control.ts`: adicionar `'webinario'` ao union type
`AppView` e ao mapa de permissão (padrão igual `workshops: permissions.canViewNpa`
— aqui crie `canViewWebinario` seguindo o mesmo padrão de leitura de
`role_permissoes`/`tem_permissao('webinario', 'ver')` que as outras views
usam; **confira como `canViewNpa` é calculado** pra replicar certinho, não
invente um padrão novo).

Em `src/components/crm/CRMLayout.tsx`: registrar o `case 'webinario':` no
switch de telas, apontando pro componente novo da TAREFA W2.

### TAREFA W2 — Tela "Webinário" (visão geral + leads + config)
Arquivo novo: `src/components/crm/webinario/WebinarioPainel.tsx` (crie a
pasta `webinario/` dentro de `crm/`, mesmo padrão de `crm/finance/` ou
`crm/kanban/`). 3 abas:

**Aba "Visão Geral"** — métricas do funil, lendo `webinario_tracking` +
`leads` (join por `lead_id`), filtrável por período (hoje/7d/30d, mesmo
padrão de filtro de data já usado em `MetaAdsPanel.tsx`):
- Cadastros, % que entrou na sala, % assistido por estágio (barra ou
  funil visual: registered → entered → watched_25 → ... → cta_seen →
  offer_clicked), cliques na oferta.
- Vendas e receita atribuídas ao canal 'webinario' — **ver como
  `leads.canal`/`vendedor` já é cruzado com `pagamentos`/`alunos` em
  outro painel de métricas (`time_comercial_vendas_por_mes` ou similar via
  RPC) antes de escrever uma query nova do zero.**
- CPL/ROAS: deixar só como TODO comentado (fora de escopo agora, falta
  integração com Meta Ads — ver `docs/GESTOR_TRAFEGO.md`).

**Aba "Leads"** — lista de `leads` filtrada por `canal='webinario'`, com
filtros por `status`, `vendedor`, data. Reaproveitar componente de lista de
leads já existente se houver um genérico (`NPAEventos.tsx` e `LancamentoKanban.tsx`
têm padrões de tabela/lista de leads — não reinvente a paginação/busca do
zero, copie o padrão de um desses).

**Aba "Configuração"** — form pra editar a linha de `webinarios` (nome,
slug, video_url, video_duracao_segundos, oferta_offset_segundos,
grupo_whatsapp_url, ativo) + CRUD simples de `webinario_mensagens_chat`
(lista ordenada por `segundo`, adicionar/editar/remover linha — é o "chat
fake roteirizado" que a sala pública usa).

### TAREFA W3 — Kanban visual do webinário (prioridade média, pode ficar
pra depois se o tempo apertar)
O Pedro pediu explicitamente um quadro Kanban com 3 colunas — **Cadastro**,
**Entrou na aula**, **Interessado** — pra visualizar o funil do webinário
antes do handoff pro comercial. A coluna `kanban_colunas.webinario_id` já
existe no banco pra isso (mesmo padrão de `npa_evento_id`), mas **ainda
não decidimos exatamente como popular/mover os cards** (hoje o estágio
real mora em `webinario_tracking.watch_stage`, não em `leads.status` —
`leads.status` só muda pra 'interessado' no handoff final). Antes de
construir: mapeie como `NPAKanban.tsx`/`useKanbanColunas.ts` fazem esse
tipo de board e decida com o Pedro (ou documente a decisão aqui) se o
Kanban lê direto de `webinario_tracking.watch_stage` (3 buckets:
registered→Cadastro, entered..completed→Entrou, cta_seen+→Interessado) em
vez do padrão usual de `leads.status` por coluna.

## Entrega de 24/10/2026

- W1–W3 publicados no CRM em **Canais de Aquisição > Webinário**. O Kanban
  lê `webinario_tracking.watch_stage`, sem movimentação manual de pagamento.
- Três campanhas configuradas e páginas de captura publicadas:
  `https://sistema.idmpsi.com.br/webinario/escuta-psicanalitica`,
  `https://sistema.idmpsi.com.br/webinario/padroes-emocionais` e
  `https://sistema.idmpsi.com.br/webinario/formacao-psicanalise`.
  Os roteiros integrais estão em `docs/campanhas/WEBINARIO-*.md` e na aba
  Configuração do CRM; as três gravações constam como pendência no calendário
  de conteúdo para Rodrygo. São datas sugeridas, não publicação automática.
- Cadastro real de teste pela função pública criou lead, sessão e tracking;
  os três registros sintéticos foram removidos e a ausência confirmada.
- As páginas pós-cadastro informam corretamente que a gravação ainda está em
  preparação. **A exibição da aula não está pronta para essas três campanhas**
  até Rodrygo gravar e o vídeo real ser configurado; não divulgar como aula
  disponível agora. Vendas atribuídas à matrícula e ROAS também seguem
  pendentes, sem números fictícios no painel.
- SQL aditivo aplicado: `20261024020000_webinarios_temas_e_sala_publica.sql`,
  `20261024021000_webinario_policies_anon_fix.sql` e
  `20261024031000_webinario_pautas_responsavel.sql`. Como a aplicação foi pela
  Management API (`supabase db query`), reconciliar o histórico de migrations
  antes de um futuro `supabase db push`.

### Pacote de gravação e Social Media

- Os três roteiros integrais agora têm falas propostas para Rodrygo e
  Jocimara, mapa AIDA, intervenções e checagens éticas. Cada tema também tem
  `WEBINARIO-0x-PRODUCAO.md` com copy integral do vídeo curto de captura,
  anúncio vertical e oito perguntas-guia sincronizadas provisoriamente.
- Nove cards no Kanban de conteúdo: aula, vídeo de captura e anúncio para
  cada tema. Os nove têm `texto_peca` preenchido com o roteiro integral,
  `responsavel` no perfil de Rodrygo e Jocimara indicada como coapresentadora
  proposta nas instruções. Status `roteiro` — nada gravado/publicado.
- As 24 mensagens da sala são assinadas “Equipe IDM”, com aviso público de
  que se trata de perguntas preparadas, não comentários de audiência ao vivo.
  Ajustar os segundos à edição final de cada gravação.
- Campo opcional `webinarios.captura_video_url` separado de `video_url` da
  aula; a página só mostra o vídeo curto quando a URL real é preenchida.
  Migration aditiva `20261024032000_webinario_video_captura.sql` aplicada.

## Não faça
- Não mexa nas edge functions (`webinario-registrar`, `webinario-track`,
  `webinario-sessoes-cron`) nem nas páginas públicas (`src/pages/webinario/*`)
  sem anotar aqui antes — é território do Claude por enquanto.
- Não crie migration nova sem me avisar/mostrar antes — é produção com
  dado real (~250 alunos, ~2.900 pagamentos, ~12 mil leads), só aditivo.
- Integração com Meta Ads e otimização por IA: fora de escopo, só TODO.
- **Mobile-first é inegociável** — pedido explícito do Pedro, a maioria dos
  leads acessa pelo celular. Teste a tela de leads/visão geral em viewport
  mobile antes de dar como pronto.

## Antes de dar como pronto
- `npm run typecheck` sem quebrar o baseline.
- Testar a tela abrindo de verdade (login no CRM, não só leitura de código).
- Reportar em português simples o que ficou pronto e o que falta — é assim
  que o Pedro gosta de acompanhar.

## Log de coordenação

**26/10/2026 — Codex, página de captura completa:** a pedido do Pedro, as três páginas públicas de captura foram reconstruídas segundo o formato integral da página da Turma 47: cabeçalho, abertura, vídeo/apresentação, formulário, seção de quando/como funciona, pilares, público, depoimentos já exibidos na página da Turma 47 (explicitamente sobre alunos do IDM, não resultados do webinar), instituto, professores, FAQ, chamada final e rodapé. Cada tema tem copy própria nas seções temáticas. Não foram replicadas promessas de três aulas ao vivo, certificado, ebook ou vagas limitadas, pois não correspondem ao webinar evergreen. Nenhum vídeo foi publicado nem inscrição de teste criada nesta alteração. Validar e publicar o código após revisão; a gravação final continua pendente.

**26/10/2026 — correção de fidelidade visual:** após revisão do Pedro, o layout anterior foi substituído por uma réplica visual direta da página da Turma 47, sem cabeçalho/menu: hero centralizado em branco/dourado, faixa de informação, vídeo e formulário empilhados, calendário visual, três pilares com topo dourado, depoimentos, seção institucional, fotos dos professores, FAQ e CTA final. A copy e o estado da gravação são específicos de cada webinar. As fotos e depoimentos reaproveitam os mesmos recursos públicos da página da Turma 47; revisar a identidade/foto de Jocimara antes da publicação final, pois a página de origem usa outro sobrenome na legenda. Não há vídeo de webinar publicado ainda.

**24/10/2026 — Codex:** W1 (menu/rota/permissão), W2 (visão geral, leads e
configuração) e W3 (Kanban de leitura) implementados apenas na área interna.
Não alteradas edge functions nem páginas públicas. Uma migration aditiva,
`20261024010000_webinario_permissoes_admin.sql`, foi mostrada e autorizada
pelo Pedro antes da aplicação; libera `ver`/`editar` só para `admin`.

**Decisão W3:** o quadro não usa `leads.status` para as três colunas.
Lê `webinario_tracking.watch_stage`, consolida sessões repetidas pelo
estágio mais avançado e distribui `registered` → Cadastro,
`entered` até `completed` → Entrou na aula,
`cta_seen`/`offer_clicked` → Interessado. É somente leitura: o handoff
para o comercial continua exclusivo da edge function já existente. A
coluna `kanban_colunas.webinario_id` fica reservada para personalização
futura, sem seed nem duplicação de estado agora.

**Limite de atribuição:** a página pública da oferta hoje abre a matrícula
com nome/e-mail/WhatsApp, mas não passa `lead_id`. O painel evita chamar
qualquer matrícula/pagamento de “venda do webinário” por coincidência de
identidade; vendas/receita ficam explicitamente pendentes até existir
vínculo confiável no fluxo de checkout (território do Claude).

**Verificação Codex:** build de produção e lint da pasta `webinario/` passaram;
2 testes unitários do funil passaram. O teste não importa o cliente Supabase,
conforme a regra do `vitest.config.ts`. O typecheck foi executado após as
alterações. Publicação e teste autenticado em viewport mobile permanecem
separados desta etapa local, para não publicar por acidente as mudanças
simultâneas de outros módulos no mesmo checkout.

**Histórico de migrations:** os dois `INSERT` de permissão admin já estão
aplicados e verificados no banco. A CLI não conseguiu registrar o arquivo
`20261024010000` em `supabase_migrations.schema_migrations` por falha de
autenticação da conexão temporária; o SQL é idempotente. Antes de um próximo
`db push`, conferir o histórico também da migration `20261024000000`, que
aparece local-only embora a estrutura exista no banco.

**24/10/2026 — Claude, investigação do limite acima:** o problema é mais
fundo do que “falta passar lead_id”. `MatriculaTimeComercial.tsx` **não lê
nenhum query param hoje** (os `nome`/`email`/`whatsapp` que
`WebinarioOferta.tsx` manda na URL são ignorados) e o canal da venda vai
**hardcoded `p_canal: 'Direto'`** pra RPC `matricula_time_comercial_criar`,
pra qualquer vendedor/origem. Não mexi nisso agora — é fluxo de pagamento
real em produção, e mudar o valor fixo de `p_canal` pode afetar outro
relatório que já depende dele ser sempre 'Direto'.

**25/10/2026 — Claude, resolvido (parcialmente) sem mexer no checkout:**
descobri que `p_canal` nem é um campo estruturado — vira só uma nota de
texto dentro de `alunos.observacoes` (“Canal: X”), e a receita por canal no
`TimeComercial.tsx` **é lançamento manual mensal do vendedor, não puxa de
`alunos`/`pagamentos` automaticamente pra NENHUM canal** (SDD, Workshop,
etc. também funcionam assim hoje). Ou seja, o gap de atribuição de venda é
um limite do sistema inteiro, não algo específico do webinário — não dava
pra “resolver” isso sozinho sem redesenhar como todo canal reporta receita.

O que resolvi de verdade: o **funil de leads** (não a venda em si) agora
aparece certinho no painel que a Helen já usa. Troquei
`webinario-registrar` pra gravar `canal='Webinário'`, `origem='Time
Comercial'` e `campanha_id` apontando pra uma campanha em
`time_comercial_campanhas` por tema (criei 4, uma por webinário, canal
'Webinário', tipo 'novo' — nova coluna aditiva
`webinarios.time_comercial_campanha_id` faz esse link). Migration
`webinario_time_comercial_campanha` aplicada. Com isso, o Pedro e o
Rodrygo já veem os leads do webinário no Time Comercial, filtráveis por
tema, com o funil normal (novo → interessado → ... → fechado) e a
atribuição de vendedor (Helen) que já funcionava. Testei de ponta a ponta
e conferi os valores gravados no lead antes de limpar o teste.
