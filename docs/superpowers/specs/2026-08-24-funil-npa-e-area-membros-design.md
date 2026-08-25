# Funil de vendas do NPA + integração com a Área de Membros IDM

Data: 2026-08-24
Status: aprovado para plano de implementação

## Contexto

A página "IDM Pelo Brasil" (evento NPA presencial, componente `NPAKanban.tsx`) hoje mistura
num único Kanban de 9 colunas a logística pré-evento (Novo → Ingresso pago → No grupo →
Confirmado) com etapas pós-evento pouco úteis pra enxergar resultado de venda (Evento → Closer
→ Follow Up 01/02/03 → Matrícula). Não há nenhuma visão que responda diretamente "quantas
pessoas foram, quantas compraram o material, quantas compraram a mentoria" — cada número exige
filtrar leads na mão.

Paralelamente, existe um projeto separado e já maduro — **Área de Membros IDM** (Next.js,
repo `Area-de-Membors`, Supabase próprio `gkbjemvwutaiksuueiqt`) — com login por email/senha,
catálogo de produtos (`products`/`enrollments`) e um hub "Mentoria NPA" que já sabe liberar
conteúdo por produto comprado (ebook+telas do presencial vs. curso gravado + comunidade +
Perfil Numerológico + Mapa 7 Esferas da mentoria completa). Essa área de membros já lê dados
do Sistema 11ds (tem a service role key configurada) para a página pública `/npa-presencial`
de entrega do material no dia do evento — mas **não existe nenhum caminho automático do
Sistema 11ds para lá**: hoje, pra liberar alguém, um admin abre `/admin/alunos` na Área de
Membros e matricula manualmente, um por um, usando um formulário próprio (nome, email,
produto).

O dono do sistema fecha vendas de NPA presencial, material físico do evento e mentoria em
massa, todo mês, em vários eventos simultâneos — o processo manual de matrícula não escala e
deixa vendedor e financeiro sem visibilidade nenhuma de quem já tem acesso.

**Decisão tomada com o dono:** o campo `matriculado` que já existe em `npa_evento_leads`
**é** o "comprou mentoria" (confirmado) — não é preciso reconciliar dois conceitos. O
`comprou_material` que já existe também é o mesmo "material" que se quer liberar na Área de
Membros — outra reconciliação que não é necessária. NPS (Numerologia Pitagórica Sistêmica, o
produto vendido depois da mentoria) já tem registro hoje via `alunos`/`turmas` com
`produto = 'numerologia'`, fora de `npa_evento_leads` — mas ainda não tem produto/conteúdo
correspondente na Área de Membros, então fica de fora da liberação automática por enquanto.

Este documento cobre três entregas, desenhadas juntas mas implementadas em sequência:

1. **Funil de vendas do NPA** — redesenho da página do evento e de uma nova visão consolidada
   (Sistema 11ds apenas).
2. **Provisionamento automático na Área de Membros** — quando o funil acima marca
   material/mentoria como comprado, a Área de Membros ganha a conta e o produto liberado sem
   ação manual.
3. **Visibilidade comercial/financeiro** — o resultado da Parte 1 já responde isso; mais um
   badge por lead e uma extensão da aba Numerologia do Financeiro.

---

## Parte 1 — Funil de vendas do NPA (Sistema 11ds)

### Dado que já existe (não muda de lugar)

Tabela `npa_evento_leads` já tem tudo que o funil precisa:

| Campo | Significado |
|---|---|
| `ingresso_pago` (bool) | comprou ingresso |
| `esteve_no_evento` / `presente_evento` (bool) | foi ao evento |
| `comprou_material` (bool) + `valor_material` | comprou o material físico vendido no evento |
| `matriculado` (bool) + `valor_matricula` | comprou a mentoria completa |
| `email` | já coletado — é o que identifica a pessoa na Área de Membros |

O funil de compras é 100% derivado desses campos — não precisa de coluna nova.

### Gap a fechar

`comprou_material` já tem um botão de toggle no card do lead (`NPAKanban.tsx`, componente do
card, função `handleToggleMaterial`). `matriculado` **não tem** — hoje só é setado por fora
(import de planilha ou edição direta). Vai ganhar um toggle irmão, "Comprou mentoria?", ao
lado do de material, seguindo o mesmo padrão visual e o mesmo handler (otimista, com rollback
em erro).

### Página do evento (ex.: "NPA #19 Santos")

Troca o Kanban de 9 colunas por duas faixas:

- **Antes do evento** (logística, mantém as 4 primeiras fases: Novo, Ingresso pago, No grupo,
  Confirmado) — continua existindo porque é um processo operacional real de aproximar o lead
  do evento, só fica menor e deixa de disputar espaço com o resultado de venda.
- **Depois do evento** (funil de compras, a parte nova): 5 blocos clicáveis —
  "Comprou ingresso, não foi" / "Foi, não comprou nada" / "Foi, comprou material" /
  "Foi, comprou mentoria" / "Está no NPS" — cada um com a contagem e, ao clicar, a lista de
  leads daquele grupo (nome, WhatsApp, valor, status de acesso à Área de Membros).
- "Está no NPS" é calculado consultando `alunos`/`turmas` (produto = `numerologia`, turma
  cujo nome identifica NPS) pelo `pessoa_id`/telefone do lead — não é um campo novo em
  `npa_evento_leads`.
- As fases "Closer" e "Follow Up 01/02/03" deixam de ser colunas do Kanban — "closer" vira um
  dado exibido no card do lead (quem fechou), e follow-up pós-evento passa a ser tratado pelo
  sistema de follow-up automático por vendedor já existente (`followup_sequencias`/
  `followup_passos`, Time Comercial), não por uma fase manual do Kanban do evento.
- `npa_evento_leads` tem dois campos de presença (`esteve_no_evento` e `presente_evento`) —
  o funil novo usa só `esteve_no_evento` (é o que já aparece combinado com `comprou_material`
  no código atual do Kanban); `presente_evento` fica identificado como campo legado/duplicado,
  sem uso novo, candidato a aposentar depois que se confirmar que nada mais depende dele.

### Página "IDM Pelo Brasil" (visão consolidada — nova)

Hoje, clicar no grupo "IDM Pelo Brasil" no menu só expande a lista de eventos
(`Sidebar.tsx`, grupo `npa_dinamico`) — não abre tela nenhuma própria. Passa a abrir uma
página nova (extensão de `NPAEventos.tsx`) com:

- Uma faixa de números somando **todos os eventos NPA** (ingressos vendidos, foram, compraram
  material, compraram mentoria, estão no NPS).
- Uma tabela por evento com as mesmas 5 colunas, ordenável, clicável linha a linha pra abrir o
  evento.

---

## Parte 2 — Provisionamento automático na Área de Membros

### Do lado da Área de Membros (repo separado, já existe quase tudo)

Já existe `src/lib/memberAccess.ts` → função `criarAcessoMembro({ email, nome, whatsapp,
produtoId })`, escrita exatamente pro cenário "compra fora do fluxo normal de checkout
logado" — cria (ou reaproveita) o usuário, gera um **magic link** nativo do Supabase
(`generateLink`) e faz o `upsert` do `enrollment`. Essa função já é usada pelo admin
`/admin/alunos` (matrícula manual) e por um fluxo de checkout externo (SyncPay).

Falta só uma porta de entrada HTTP pra essa função, chamável de fora (do Sistema 11ds), no
mesmo padrão de autenticação que a rota `criar-usuario` já usa (header `Authorization: Bearer
<chave>`):

```
POST /api/liberar-acesso
Body: { email, nome, whatsapp?, produtoSlug: 'ebook-telas-npa' | 'mentoria-npa' }
→ resolve produtoSlug → produtoId via tabela `products`
→ chama criarAcessoMembro(...)
→ responde { loginUrl }
```

Essa rota nova é o único código a escrever no repo da Área de Membros para a Parte 2.

### Do lado do Sistema 11ds

- **Gatilho**: o toggle "Comprou material?" / "Comprou mentoria?" no card do lead (o mesmo da
  Parte 1). Ao marcar como `true`, depois de salvar o campo em `npa_evento_leads`, chama uma
  nova edge function `npa-liberar-acesso-membros`.
- **Edge function `npa-liberar-acesso-membros`**: recebe `{ leadId }`, busca nome/email/
  whatsapp do lead, decide `produtoSlug` (material → `ebook-telas-npa`, mentoria →
  `mentoria-npa`), faz o `POST /api/liberar-acesso` na Área de Membros com a chave de serviço
  guardada em secret, e grava o `loginUrl` retornado de volta no lead (nova coluna
  `npa_evento_leads.acesso_membros_url`, mais `acesso_membros_liberado_em`).
- Segue o mesmo padrão de autenticação por chave dedicada já usado em `evo-proxy`/
  `wpp-enviar` (`x-cron-key`/bearer secret via RPC), não abre a chave da Área de Membros pro
  navegador.
- Falha ao chamar a Área de Membros não desfaz o toggle local (o material/mentoria já foi
  vendido) — fica um estado "liberação pendente" visível no card pra tentar de novo manualmente
  (botão "Tentar liberar acesso de novo").

### Aviso ao cliente

- **Correção**: `admin.generateLink()` (usado por `criarAcessoMembro`) só gera o link — o
  Supabase Auth não envia nada sozinho nesse modo. Não existe email automático aqui, ao
  contrário do que a primeira versão deste spec dizia.
- Único caminho de entrega implementado: o card do lead no Sistema 11ds ganha um botão
  "Copiar acesso" (aparece assim que `acesso_membros_url` é preenchido) — o vendedor copia e
  manda o link por WhatsApp na hora.
- Envio automático por email/WhatsApp fica como melhoria futura, não neste spec.

---

## Parte 3 — Visibilidade comercial/financeiro

- **Card do lead**: badge "Acesso liberado ✅ Material" / "✅ Mentoria" ao lado do toggle —
  não é tela nova, nasce do mesmo dado da Parte 1/2.
- **Financeiro → aba Numerologia**: ganha a mesma faixa de números consolidados da Parte 1
  (ingresso / foram / material / mentoria / NPS), reaproveitando a mesma query da visão
  consolidada de "IDM Pelo Brasil" — uma verdade só, dois lugares de leitura.

---

## Fora de escopo (por agora)

- **NPS na Área de Membros**: não existe produto/conteúdo lá ainda. O funil só conta quem está
  em NPS via `alunos`/`turmas`; a liberação automática de conteúdo de NPS fica para quando o
  produto existir na Área de Membros — spec futuro, quando fizer sentido vender/entregar
  conteúdo de NPS por lá.
- **Migrar a Área de Membros para o Supabase do Sistema 11ds**: os dois bancos continuam
  separados; a integração é só a chamada da Parte 2. Unificar tudo numa base só seria a opção
  "mais correta" a longo prazo, mas é um projeto muito maior, de alto risco pra uma área que já
  está em produção — não faz parte deste spec.
- **Senha padrão fixa (`idm2026`)**: existe hoje na rota `criar-usuario` (mecanismo mais
  antigo), mas a Parte 2 usa magic link (`criarAcessoMembro`), que é mais seguro e já é o
  padrão usado pro cenário de compra externa. Não mexe no mecanismo antigo, só não o reusa
  aqui.

## Riscos

- Implementação atravessa dois repositórios com deploys independentes (Sistema 11ds e
  `Area-de-Membors`, ambos no Vercel/infra próprios) — a rota nova na Área de Membros precisa
  ser implantada antes (ou junto) da edge function do Sistema 11ds que a chama, senão o toggle
  fica marcando "liberação pendente" sem nunca resolver.
- `criarAcessoMembro` já existe e está em uso — reaproveitar é seguro, mas qualquer mudança
  nela também afeta o fluxo de checkout externo (SyncPay) que já depende dela hoje.
