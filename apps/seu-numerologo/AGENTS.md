# Instruções para quem (ou o quê) for trabalhar nesta pasta

Esta pasta (`apps/seu-numerologo/`) é o produto **Seu Numerólogo**
(`mapa.seunumerologo.com.br`): funil de venda do mapa numerológico pitagórico
+ a ferramenta Mapa 7 Esferas (benefício das Mentorias NPA/NPS). Trazida pra
dentro deste repositório em 08/11/2026 via `git subtree add --prefix=apps/
seu-numerologo`, histórico de commits preservado — o site **não foi
reescrito**, continua o mesmo código estático de antes.

**Leia também o `AGENTS.md` da raiz** — convenções gerais do grupo.

## Stack

HTML/CSS/JS puro, **sem framework, sem build step**. i18n próprio (pt/en/es)
em `assets/i18n.js` + `locales/*.json`, com o idioma `pt` ainda público e
`en`/`es` atrás de `?i18n_preview=1` até passar QA editorial humana (ver
`docs/plano-acao-i18n-stripe.md`). `middleware.js` (Vercel Edge Middleware)
detecta idioma por IP.

## Um banco só — o mesmo do CRM raiz

Ao contrário de `apps/membros` (que tem Supabase próprio, "IDM Members"),
este app **já usa o mesmo projeto Supabase do CRM na raiz deste repo**
("Plataforma 11ds", ref `usqiyekfmwwnvkmkdlej`) — `supabase/functions/
lead-event`, `vega-webhook` etc. gravam direto nas tabelas daqui. Não
duplicar cadastro de lead/aluno num banco à parte.

## ⚠️ Mesmo projeto Supabase = cuidado com nome de edge function

Como o banco é o mesmo da raiz, **função com o mesmo nome nas duas pastas
compartilha o mesmo slug no mesmo projeto** — deploy de uma sobrescreve a
outra. Achado em 12/11/2026: existiam dois `vega-webhook` (um aqui, outro
em `supabase/functions/` na raiz). O que está **no ar é o da raiz**, que já
roteia os três casos (NPA, material e o produto do Seu Numerólogo, via
`processNumerologa` + tabela `seu_numerologo_leads`). Um deploy feito desta
pasta teria derrubado a venda de ingresso do NPA.

A cópia antiga daqui foi renomeada pra `supabase/functions/_vega-webhook-antigo/`
— prefixo `_` faz a CLI do Supabase ignorar na hora do deploy. Ela **não
está no ar** e serve só de referência: é a única versão que tem a entrega do
PDF do mapa por e-mail (Resend) + Meta CAPI, que a versão da raiz não tem
(por isso `seu_numerologo_leads.mapa_enviado` está zerado). O cabeçalho dela
cita `DS11_URL = qdpitjwpvmqsgshsdiab.supabase.co`, projeto que não existe
mais na conta — é da arquitetura antiga, quando o SN tinha banco próprio.

Antes de criar função nova aqui, confira se o nome já existe em
`supabase/functions/` na raiz.

## Deploy

Projeto Vercel próprio ("seu-numerologo-igeo"), Root Directory =
`apps/seu-numerologo`, domínio `mapa.seunumerologo.com.br` — **fica fora**
da reorganização de domínios institutodespertamente.com.br/idmpsi.com.br
(marca própria, domínio dedicado recém-renovado). Não compartilha build nem
deploy com o CRM da raiz nem com `apps/membros`.

## Mapa 7 Esferas — acesso hoje

`mapa-7-esferas.html` exige SSO vindo de `apps/membros` (hash
`#sso_at=...&sso_rt=...`) e confere elegibilidade chamando
`POST /api/liberar-acesso` / `/api/access/check` em `apps/membros` — hoje a
fonte de verdade de "quem tem acesso" ainda é a tabela `enrollments` do
Supabase "IDM Members" (local a `apps/membros`), **não** a `alunos` deste
CRM raiz. Isso é temporário: quando a Fase 1-3 do plano de unificação
`apps/membros`↔CRM estiver pronta (RPC `portal_elegibilidade_por_pessoa`),
trocar a checagem por essa RPC em vez do `enrollments` local — ver nota na
Fase 6 do plano ativo (`typed-seeking-wren.md`) e a seção "Seu Numerólogo"
acrescentada lá.

## Pendências conhecidas (não resolver sem avisar)

- A ferramenta "Perfil Numerológico" (análise de 3 pontos, benefício da
  Mentoria NPA) está fora do ar há meses — código-fonte original perdido
  quando um ex-sócio saiu, nunca foi reconstruída. Projeto à parte, real,
  não é bug pra corrigir rápido.
- `supabase/functions/nps-financeiro/index.ts` (no CRM raiz) tinha um bug
  real — filtrava `produto ilike 'nps'`, mas o valor em `alunos.produto`
  pra essa turma é `'numerologia'`. Corrigido em 08/11/2026.
