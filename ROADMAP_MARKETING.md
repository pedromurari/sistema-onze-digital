# Roadmap — DP Marketing

Plano pro Codex estruturar o departamento de Marketing: otimizar o que já
existe e preparar o terreno pra contratar uma social media pra cuidar do
conteúdo (Reels, posts, carrossel) do dia a dia do IDM — aulas, tutorias,
making of — hoje sem nada sendo postado disso.

**Antes de implementar qualquer item, leia `AGENTS.md`** (convenções de
RLS/GRANT/`tem_permissao`). Convenção de status: 🟢 pronto · 🟡 parcial/em
andamento · ⚪ não iniciado.

---

## O que já existe hoje (não reconstruir do zero)

Levantamento feito em 23/10/2026 — isso evita duplicar trabalho.

- **Post** (`Posts.tsx`) — gera posts automaticamente pela Equipe 11DS (IA),
  tabela `conteudo_posts` + `conteudo_clientes` (perfil de marca: nicho,
  tom de voz, pilares de conteúdo). Fluxo linear rascunho → aprovado →
  publicado. **Isso é conteúdo gerado por IA pra clientes de produto
  (Equipe 11DS), não o fluxo manual de social media do IDM** — são coisas
  paralelas, não confundir.
- **Social Media** (`operacoes/CalendarioConteudoView.tsx`, dentro de
  `Operacoes.tsx`) — tabela **`conteudo_calendario`**. Já tem 3 views
  (grade, calendário, **Kanban**) com 7 colunas que já batem quase exatamente
  com o pedido: `ideia → roteiro → gravando → editando → aprovado →
  agendado → publicado`. Já tem campo `formato` (reels, feed, stories,
  carrossel, vídeo, short) — **o filtro por tipo que o Pedro pediu já existe
  como campo**, só falta expor como filtro de verdade na UI. Hoje:
  - Mudança de coluna é um `<select>` dentro do card, não drag-and-drop de
    verdade.
  - Não tem upload de arquivo — só um campo de texto livre "cole o link do
    Drive aqui", preenchido na mão, sem integração real.
- **Reels IDM** (`ReelsIDM.tsx`) — dois modos: (A) gerar vídeo 100% por IA
  a partir de um tema (roteiro → narração → render, aprovação antes de
  gastar); (B) subir um vídeo próprio pra edição automática por IA (corte de
  silêncio, legenda, zoom). Tabela `video_jobs`. **Nunca publica sozinho** —
  sempre para em `ready_for_review`. É edição por IA, não o fluxo de
  "editor humano pega bruto e devolve pronto" que o Pedro quer agora — outra
  trilha paralela.
- **Gestor de Tráfego** (`GestorTrafego.tsx`) + **Regras de Automação**
  (`RegrasAutomacao.tsx`) — integração real e ativa com a **Graph API da
  Meta**, só do lado de **Ads** (token de Usuário do Sistema, secrets
  `META_MARKETING_ACCESS_TOKEN`/`META_ADS_ACCOUNT_ID`, escopos
  `ads_management`/`ads_read`). **Não existe publicação orgânica no
  Instagram** em lugar nenhum do código — isso é 100% novo (ver item 6).
- **Diretor** (`MarketingDiretoria.tsx`) — hoje são só 3 cards de texto fixo
  (Diretor = Pedro, Gerente = vago, Gestor de Tráfego = agente). Sem KPI,
  sem dado em tempo real, sem playbook. Mesmo ponto de partida que RH/
  Comercial/Pedagógico tinham antes das Diretorias reais (ver item 1).
- **Upload pro Google Drive já funciona** — `src/hooks/useGoogleDriveUpload.ts`
  é um hook real e funcional (OAuth via Google Identity Services, upload
  resumível, link público automático). Usado hoje em `EntregasParceiros.tsx`
  e em um Kanban órfão (próximo item). Hoje sobe tudo pra **uma pasta fixa
  hardcoded** (`FOLDER_ID` fixo no arquivo) — sem estrutura por post/mês.
- **Kanban com drag-and-drop de verdade já existe, mas está órfão:
  `src/components/crm/Rodrygo.tsx`.** Drag-and-drop real (não dropdown),
  3 colunas (a fazer/em andamento/concluído), categorias incluindo
  🎬 **Script de Vídeo** e 📱 **Social Media**, upload de vídeo direto no
  card já ligado ao `useGoogleDriveUpload.ts`. **Não está conectado a nada**
  — não aparece no `Sidebar.tsx` nem no `CRMLayout.tsx` (só a permissão
  `canViewRodrygo`/view key `'rodrygo'` já existe em `access-control.ts`,
  sem rota real). É a peça que mais se parece com o que o Pedro descreveu
  (alguém sobe a gravação, o editor pega, edita, sobe pronto) — mas foi
  construída pra outro propósito e esquecida.
- **Aquila Matheus Andrade de Oliveira** (o editor de vídeo) já está
  cadastrado em `profissionais` (RH): função "Editor de vídeos", vínculo PJ,
  modelo de pagamento fixo — **valor ainda não definido** (Pedro disse que
  ia decidir depois). `profissionais` não tem login — é só registro de
  pagamento, não dá acesso ao sistema.
- **Acesso externo**: o único padrão hoje é `user.tipo === 'parceiro'` →
  desvia pro `ParceiroPortal.tsx`, um portal isolado fora do CRM normal.
  Não existe hoje um terceiro perfil pra colaborador externo tipo editor.

---

## Itens a construir

### 1. Diretoria Marketing de verdade 🟢

**23/10/2026 — Codex:** `MarketingDiretoria.tsx` deixou de ser texto fixo.
Mostra contagem exata por etapa, produção/revisão, prontos/programados e
conteúdos marcados como publicados na competência pela data editorial.
O playbook registra decisões já tomadas. Sem meta numérica inventada e sem
afirmar que o status publicado prova postagem real na rede.

Mesmo padrão já validado em `src/components/crm/rh/DiretoriaRH.tsx`,
`comercial/DiretoriaComercial.tsx` e `pedagogico/DiretoriaPedagogico.tsx`
(painel de KPIs em tempo real + playbook de decisões, ver esses três
arquivos como referência direta de estrutura). Substitui os 3 cards
estáticos de `MarketingDiretoria.tsx`.

KPIs sugeridos (a partir de `conteudo_calendario`, depois que o item 2
estiver de pé):
- Posts/reels em cada etapa do Kanban (quantos parados em "editando" há
  mais de X dias — sinal de gargalo no editor).
- Publicados no mês vs. meta (se decidirem meta).
- Aniversariantes do mês (ver item 5) como lembrete de pauta.

### 2. Kanban único de conteúdo (Reels/vídeo + post estático + carrossel) 🟡

**23/10/2026 — Codex:** filtro de formato adicionado à grade, calendário e
Kanban, sobre os mesmos registros de `conteudo_calendario`. Upload manual
integrado ao Drive nos cards já salvos, com pasta por mês/card e sem link
público automático; depende de autorização Google e permissões na pasta.
Acesso do editor ainda pendente; o dropdown de etapa foi mantido por enquanto,
pois já permite a movimentação sem introduzir erro de drag-and-drop.

**Decisão confirmada com o Pedro (23/10/2026): um Kanban só, tipo
diferenciado por filtro/menu — não um board separado por formato.**

Base: **reaproveitar `conteudo_calendario` + `CalendarioConteudoView.tsx`**,
não criar tabela nova — já tem as 7 colunas certas e o campo `formato` que
cobre exatamente esse filtro (reels, feed, stories, carrossel, vídeo,
short). Faltam 3 melhorias nele:

- a) **Filtro de formato de verdade na UI** — implementado na grade, no
  calendário e no Kanban.
- b) **Upload de arquivo real** — implementado para cards salvos; o campo
  de link manual foi mantido como alternativa. Falta validar com a conta
  Google autorizada antes de considerar o fluxo inteiramente pronto.
  Reaproveitar `useGoogleDriveUpload.ts` (já funciona, já é usado em dois
  lugares) em vez de escrever um upload novo.
- c) **Avaliar** se vale trocar o `<select>` de mudança de etapa por
  drag-and-drop de verdade — `Rodrygo.tsx` já tem essa lógica pronta
  (`draggingTaskId`/`dragOverColumn`/`onDrop`), só precisa ser portada pro
  `CalendarioConteudoView.tsx` (ou decidir que o dropdown já resolve e não
  mexer — Pedro comentou "não precisa ser muito diferente do que já tem").

Dado o achado do `Rodrygo.tsx`: ele é tecnicamente mais parecido com o
pedido (DnD real + upload already wired), mas é uma tabela diferente
(`tarefas`, não `conteudo_calendario`) e um propósito mais genérico (não é
só conteúdo). **Recomendação: não ressuscitar o `Rodrygo.tsx` como tela —
só portar as duas peças úteis dele (upload + DnD) pro
`CalendarioConteudoView.tsx`**, que já é a tela "oficial" de Social Media no
menu e já tem os campos de domínio certos (plataforma, formato, legenda).

### 3. Acesso do editor externo ⚪

**Decisão de arquitetura (23/10/2026):** seguir a Opção A, com login por
pessoa e portal isolado. Não criar usuário compartilhado nem liberar cards
por link público. Implementação depende de RLS por atribuição e provisionamento
de contas; ainda não construída.

Pedro quer "mandar o acesso pro Rodrygo gravar/subir e pro editor pegar,
editar e subir de volta". Não existe hoje um perfil pra isso. Duas opções
pra decidir antes de começar:

- **Opção A (recomendada)** — novo `tipo: 'editor'` em `profiles`/`user_roles`,
  com portal próprio isolado, no mesmo molde do `ParceiroPortal.tsx`
  (`src/pages/Index.tsx` linha ~57 decide o desvio por tipo). Visão restrita
  só aos cards do Kanban de conteúdo atribuídos a ele — não entra no resto
  do CRM. Precisa de login de verdade (email/senha), então dá pra reusar
  depois pra outros editores/freelas.
- **Opção B** — link mágico por token na URL, sem login, igual
  `/presenca/:aulaId` e `/avaliacao/:id` hoje. Mais rápido de construir, mas
  não dá histórico de "quem fez o quê" nem permite ver múltiplos cards de
  uma vez sem gerar um link por card.

Recomendação: Opção A, porque o editor vai voltar toda semana (é
recorrente, não um acesso pontual) e a equipe pode crescer (mais um editor,
mais um social media).

### 4. Estrutura de pastas no Google Drive 🟡 — organização decidida

**Decisão de arquitetura (23/10/2026):** usar a pasta raiz existente do
upload, com subpastas `Marketing/AAAA-MM/<id-do-card>`. Assim arquivos brutos,
versões editadas e arte final do mesmo conteúdo ficam juntos; o mês facilita
o arquivo. A criação/busca das pastas foi implementada no hook; precisa de
teste manual com a conta Google autorizada. Sem liberação pública automática
para os uploads do Marketing.

`useGoogleDriveUpload.ts` hoje sobe tudo pra uma única pasta fixa
(`FOLDER_ID` hardcoded no arquivo). Antes de ligar o upload no Kanban (item
2b), decidir a estrutura: uma subpasta por mês? Por post/card (nome =
id do card)? Isso evita uma pasta única virando um saco de gatos com
centenas de arquivos soltos.

### 5. Menu de Aniversariantes do mês 🟢

**23/10/2026 — Codex:** menu admin-only de aniversariantes dos alunos,
filtrado por mês e ordenado por dia. Sem equipe/professores por enquanto;
uso interno para pauta, sem postagem ou mensagem automática. Mostrar nome
em material público depende de autorização de uso de dados/imagem.

Implementado com `data_nascimento` de `alunos`, sem conversão de fuso que
desloque o dia. É referência interna para pauta no Kanban; não cria post
nem mensagem automaticamente.

### 6. Conexão com Meta/Instagram pra publicar sozinho ⚪ — por último, de propósito

O pedido de "conexão com Meta/Instagram pra fazer as publicações sozinho" é
o item de maior risco e trabalho:
- Precisa de **Instagram Graph API** (conta Business, não a mesma coisa que
  o token de Ads que já existe) — escopo diferente
  (`instagram_content_publish`), processo de **app review** do Facebook/
  Meta que não é instantâneo (pode levar dias/semanas em avaliação deles).
- Precisa de uma function de agendamento (cron) que publica na hora certa
  — algo como `social-publicar-agendados`, no mesmo padrão de
  `aulas-aviso-meet` (cron por minuto já existe nesse formato no projeto).
- **Só vale a pena depois do pipeline manual (itens 2-5) estar rodando de
  verdade** — sem conteúdo fluindo direito pelo Kanban, não tem o que
  publicar automaticamente. Automatizar a ponta de publicação antes da
  produção estar redonda é otimizar a parte errada primeiro.

---

## Ordem sugerida

**1, 3 e 5 podem andar em paralelo** (baixo acoplamento entre eles — cada
um é uma tela nova ou um reskin, sem dependência um do outro).

**2 depende de uma decisão de arquitetura antes de codar** (confirmar
Opção A do item 3 se o upload vai exigir saber "quem é o editor logado" pra
registrar quem editou cada card) — mas pode começar pelos itens 2a/2b que
não dependem disso.

**4 precisa ser decidido antes de terminar 2b** (senão o upload sobe pra
pasta errada e alguém tem que reorganizar depois).

**6 só depois de 2-5 estarem rodando**, nem que seja em produção por
algumas semanas pra validar o fluxo manual primeiro.

## Perguntas em aberto pro Pedro

- Aniversariante (item 5): só aluno, ou também equipe/professores?
- Estrutura de pasta do Drive (item 4): por mês, por card, ou outra lógica?
- Quando tiver um segundo editor/social media contratado, o acesso (item 3)
  deve ser por pessoa ou um login compartilhado da função? (Recomendação:
  por pessoa, fica mais fácil saber quem editou o quê.)
