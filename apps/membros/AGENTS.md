# Instruções para quem (ou o quê) for trabalhar nesta pasta

Esta pasta (`apps/membros/`) é o **site institucional + área de membros**
do Instituto Despertamente (www.idmpsi.com.br), trazido pra dentro deste
repositório em 08/11/2026 via `git subtree` — o histórico de commits
anterior foi preservado, mas o app em si **não foi reescrito**. Continua
sendo um projeto Next.js próprio, deployado separadamente no Vercel
(projeto "members-onze-digital"), não faz parte do build do CRM na raiz.

**Leia também o `AGENTS.md` da raiz do repositório** (`../../AGENTS.md`)
— ele descreve o projeto todo (CRM) e as convenções gerais do grupo.

## Stack

Next.js 16 (App Router), React 19, Supabase (`@supabase/ssr`), Tailwind 4,
Mercado Pago SDK (loja interna de ebook), SyncPay (checkout de matrícula —
sendo desativado pros produtos piloto, ver abaixo).

## Dois bancos de dados diferentes — não confundir

Este app tem **Supabase próprio e separado** do CRM da raiz:

- **Este app** (`apps/membros`): projeto "IDM Members", ref
  `gkbjemvwutaiksuueiqt`. É onde moram `profiles`, `products`, `modules`,
  `lessons`, `enrollments`, `progress`, `payments`, `materials`, etc.
- **CRM da raiz** (`../../`): projeto "Plataforma 11ds", ref
  `usqiyekfmwwnvkmkdlej`. É onde moram os dados REAIS de aluno/matrícula
  (`alunos`, `turmas`, `pagamentos`).

Hoje (08/11/2026) esses dois sistemas estão sendo conectados de verdade —
ver `../../docs/superpowers/specs/2026-08-24-funil-npa-e-area-membros-design.md`
pro desenho original (NPA) e o plano ativo em
`C:\Users\pedro\.claude\plans\typed-seeking-wren.md` (Parte 1, Fases 0-6)
pra entender o estado atual da integração — está sendo generalizada pra
Psicanálise e NPS. `src/lib/sistema11.ts` é o cliente que já lê/escreve no
Supabase do CRM de dentro deste app — qualquer leitura de dado real de
aluno/matrícula deve passar por ele (ou pela RPC
`portal_elegibilidade_por_pessoa`), nunca duplicar cadastro de aluno aqui.

## Pagamento

- **Mercado Pago**: só a loja interna de produtos extras (`(member)/loja`)
  — fica como está, não é a matrícula principal.
- **SyncPay**: usado hoje no checkout de matrícula (`matricula.html`,
  `matricula-nps.html`) — está sendo **desativado** pros produtos piloto
  (Psicanálise, NPA, NPS) porque cria matrícula paralela fora do CRM/Asaas.
  O CRM da raiz usa Asaas (boleto) e Mercado Pago (cartão, só pra alguns
  produtos específicos — ver `AGENTS.md` da raiz) — não introduzir um
  terceiro gateway novo aqui sem combinar.

## Deploy

Projeto Vercel próprio ("members-onze-digital"), Root Directory =
`apps/membros`, domínios `www.idmpsi.com.br` e outros — não compartilha
build nem deploy com o CRM da raiz.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
