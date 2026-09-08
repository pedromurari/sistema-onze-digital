# Projeto: Estruturação do Financeiro — Onze / IDM

Documento de trabalho (técnico) do projeto de unificação do financeiro. Vive no repo,
cresce a cada avanço. O documento "de negócio" equivalente é o artifact **Manual do
Financeiro**: https://claude.ai/code/artifact/21a7ffb8-50c9-4760-bae6-cbda0331dc17

> Atualizado: 2026-09-08 · Branch: `main` · Supabase: `usqiyekfmwwnvkmkdlej`

---

## 1. Objetivo

Sair de um financeiro "largado" para uma função financeira operável por uma auxiliar:
dado confiável e único entre telas, DRE por competência conectado à contabilidade
(Agilize / Simples Nacional), rotina diária/semanal/mensal definida, nota fiscal em dia.

Entregável final: sistema + Manual do Financeiro fechado → contratar auxiliar financeira.

---

## 2. Contexto fixo (decisões travadas — não reabrir sem o Pedro)

- **Empresa:** GRUPO DESPERTAMENTE, CNPJ 55.184.481/0001-24. Empresário Individual, ME,
  **Simples Nacional**. Contador: **Agilize**. CNAE 8599-6/04. Sede São Paulo/SP.
- **6 contas** (enum `conta_recebimento` / `conta_pagamento`):
  - `inter` — conta do Pedro (repasse da parte dele; quase nada cai direto)
  - `c6` — conta ligada à parte do Rodrygo; **onde cai a maior parte hoje**
  - `mercado_pago` — cartão / maquininha / link / ingresso (integração Vega)
  - `asaas` — recorrência (NPS/PSI) e, daqui pra frente, **todas as novas parcelas**
  - `voomp` — plataforma da parceria Anhanguera; 1-2 parcelas por aluno para vincular a
    extensão universitária e liberar acesso à plataforma
  - `outro` — Hotmart, conta PF, etc.
- **Competência x caixa:** `pagamentos.mes_referencia` (date) = competência ·
  `pagamentos.data_pagamento` (date) = caixa. Não criar coluna nova de data.
- **Plano de contas v1** (enum `pagamentos.categoria_contabil` / `balanco_itens.categoria`):
  `receita_curso`, `matricula`, `receita_outra`, `imposto`, `taxa_gateway`, `estorno`,
  `comissao`, `repasse_investidor`, `custo_produto`, `pro_labore`, `folha`, `software`,
  `contabilidade`, `ads`, `adm`, `financeiro`, `investimento`, `distribuicao_lucro`
  (+ legado `custo_fixo`, `custo_variavel`, `alocacao`, `outro_entrada`, `outro_saida`).
- **Regra de repasse:** `src/lib/financial-utils.ts::calcRepassePagamento` — 50% base
  (IDM/Onze Digital) + 50% investidor(es) da turma via `turma_responsaveis`.

---

## 3. Arquitetura relevante

- Vite + React SPA (não é Next). Supabase Postgres + Edge Functions (Deno). ~150 migrations.
- **Camada de dados única:** `src/lib/db/` — React Query, chaves em `keys.ts`, invalidação
  cruzada + realtime. Regra: componente não chama `supabase.from()` para leitura; usa os
  hooks (`useAlunos`, `usePagamentos`, `useTurmas`, `useResponsaveis`, ...). Migração
  quase completa: Dashboard, CFO, Cobrança, e as listas principais do Financeiro já usam.
- **Cálculo financeiro:** tudo em `src/lib/financial-utils.ts` (taxa, líquido, MRR,
  inadimplência, repasse, períodos) + `src/lib/parcelasAluno.ts` (geração de parcelário).
- **Telas financeiras:** `Financeiro.tsx` (232 KB), `FinanceiroCFO.tsx` (121 KB),
  `Balanco.tsx` (75 KB), `Cobranca.tsx` (124 KB), `ComissoesFechamento.tsx` (restrito ao
  Pedro por RLS). Config em `src/components/crm/finance/`.
- **Gateways:** Edge Functions `matricula-pagamento-criar`, `matricula-boleto-mensal-gerar`
  (cron 12h/18h), `asaas-webhook-time-comercial`, `mp-webhook-time-comercial`. Secrets
  `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `MP_ACCESS_TOKEN` em Supabase → Edge Functions.
  Webhook Asaas "Sistema IDM" = **Ativado**.

---

## 4. Estado atual (2026-09-08)

- `pagamentos` ~2493 linhas · 698 pagas · `taxa_valor` preenchido em 1 · `conferido_em`
  em 0 · `conta_recebimento` em 0 (nenhuma passou por gateway ainda — tudo baixa manual).
- `alunos` 199 (174 ativos). Boleto: 138 ativos. `origem_lead`: `direto` 101, `lancamento`
  35, `time_comercial` **1**. Furos: 4 sem turma, 6 sem forma, 90 parcelas com forma nula.
- `balanco_itens` 9 linhas, todas `custo_fixo` (softwares). `balanco_config` `onze_digital`
  com `taxas`/`socios`/`parametros_cfo` **vazios**. `fechamentos` 0 (nunca travou período).
- **Asaas cobre 1 aluno** (`origem_lead='time_comercial'`). `matricula-boleto-mensal-gerar`
  é hardcoded p/ `time_comercial` + R$150 15x. `POST /payments` **não manda `fine`/`interest`**
  (multa/juros). Negativação (Serasa) não existe no código.
- **Fiscal:** CNPJ com 15 PGDAS-D + 26 DCTFWeb + DEFIS 2025 atrasados (omissão desde
  mai/2025). Nada em dívida ativa. Ver memória `situacao-fiscal-regularizacao.md` / Manual §5.
  **Não é trabalho de código** — é regularização com a Agilize (Pedro está tocando).

---

## 5. Changelog

| Data | O que |
|---|---|
| 2026-09-06 | **1.1** — removidas consts mortas `ALUNOS_SELECT_FULL/BASE` em `Financeiro.tsx` (pediam colunas fantasma). Confirmado que as leituras principais já passam pelos hooks. |
| 2026-09-06 | Manual do Financeiro publicado (artifact). |
| 2026-09-08 | **1.2** — migração `20260908120000_financeiro_1_2_...sql` aplicada. `pagamentos` +7 col (`conta_recebimento`, `forma_pagamento`, `categoria_contabil`, `nf_status`, `nf_numero`, `nf_link`, `nf_emitida_em`) + 2 índices. `balanco_itens` +5 col (`conta_pagamento`, `data_competencia`, `data_caixa`, `fornecedor`, `comprovante_url`). CHECK de `categoria` expandido p/ plano de contas. CHECK de `produto` removido em `pagamentos` e `balanco_itens`. Backfill: `forma_pagamento` ← `alunos`; `data_competencia` ← `mes_referencia`. |
| 2026-09-08 | `types.ts` atualizado à mão: blocos `pagamentos` e `balanco_itens` (colunas novas + `mp_payment_id`/`asaas_payment_id`/`link_pagamento_*` que faltavam). |
| 2026-09-08 | **1.2-UI A+B** (commit `5792005`) — `Balanco.tsx`: form de gasto com plano de contas completo + `conta_pagamento` + `fornecedor` + `data_competencia`. `Financeiro.tsx`: modal de baixa com seletor `conta_recebimento`. Contas em const local (TODO: unificar com `src/lib/contas.ts` da C3). Sem novos erros de type; 58 testes ok. |

---

## 6. Roadmap

### Fase 1 — Fundação (em andamento)
- [x] 1.1 Fonte única (cleanup)
- [x] 1.2 Modelo de dados: competência, caixa, categoria, conta, NF (migração + types)
- [ ] **1.2-UI** Ligar os campos novos nas telas:
  - [x] **A** `Balanco.tsx` — form de despesa: plano de contas + `conta_pagamento` +
        `fornecedor` + `data_competencia` (commit `5792005`).
  - [x] **B** `Financeiro.tsx` — baixa de parcela: seletor `conta_recebimento` (`5792005`).
  - [ ] **C** Painel **Notas Fiscais** (novo) — **Codex (C1)**.
  - [ ] **A2** unificar as consts de conta em `Balanco.tsx`/`Financeiro.tsx` com
        `src/lib/contas.ts` assim que a C3 do Codex cair — **Claude**.
- [ ] 1.4 `balanco_config` — form de sócios + saldo inicial por conta + alíquota efetiva
      do Simples (dados vêm do Pedro; o form pode ser feito antes).
- [ ] 1.5 Higiene — corrigir 4 alunos sem turma, 6 sem forma, 90 parcelas sem forma, 91
      "pago R$0" → `isento`. Pôr `integridade_financeira` na rotina.

### Fase 2 — DRE + Agilize
- [ ] Estrutura de DRE fechável por competência (tela).
- [ ] Exportação no formato do pacote mensal Agilize + campo p/ o retorno (DAS apurado).
- [ ] Conciliação sistema × extrato das 4 contas.

### Fase 3 — A pagar / a receber
- [ ] Agenda semanal (contas fixas + comissões + repasses).
- [ ] Régua de inadimplência. Extrato do investidor.
- [ ] Asaas: negativação (Serasa) — decisão de política + config.

### Fase 4 — Cockpit + entrega
- [ ] Dashboard financeiro único. Manual fechado. Perfil de acesso da auxiliar (RLS).

### Paralelo — Asaas (habilitar "tudo via Asaas")
- [ ] Generalizar `matricula-boleto-mensal-gerar`: hoje só `origem_lead='time_comercial'`
      + R$150 15x hardcoded. Precisa cobrir `direto`/`lancamento` e valor/parcelas do aluno.
- [ ] `POST /payments` com `fine` (multa) + `interest` (juros) — depende da cláusula do
      contrato (padrão: multa 2% + juros 1% a.m.).
- [ ] Webhook: conciliar valor recebido > valor da parcela (multa/juros efetivos).

---

## 7. Pendências externas (não bloquear o resto)

- **Pedro:** saldo de hoje de cada conta (inter/c6/mercado_pago/asaas/voomp); sócios + %;
  alíquota efetiva do Simples (ou último DAS + faturamento); cláusula de multa/juros do
  contrato; conferir toggle do webhook Asaas.
- **Agilize:** habilitação/regularização NFS-e; código de serviço + ISS; regularização
  das competências atrasadas; anexo do Simples (III vs V — depende de pró-labore).

---

## 8. Convenções

- **Migrations:** `supabase/migrations/AAAAMMDDHHMMSS_nome_em_portugues_snake.sql`.
  Aplicar via MCP `apply_migration` **e** commitar o arquivo. DDL sempre aditivo/reversível.
  **Não rodar migração destrutiva ou backfill de risco sem o Pedro aprovar.**
- **Comentários em português**, densos, explicando o "porquê" (padrão do repo).
- **Typecheck:** `npm run typecheck` (baseline-aware, `scripts/typecheck-baseline.mjs`).
  ⚠️ O baseline (`.typecheck-baseline` = 77) está poluído por WIP não-financeiro; o total
  hoje é ~84. Não "consertar" erros fora do financeiro. Só garanta que sua mudança **não
  aumenta** a contagem. `npm run typecheck:raw` mostra tudo.
- **Testes:** `npm test` (vitest). Há `financial-utils.test.ts`, `parcelasAluno` etc.
- **RLS:** matriz de acesso em `src/lib/access-control.ts` + migrations `rls_*`. Financeiro
  exige `financeiro/ver` (+ `financeiro/ver_todos` p/ visão global). Não afrouxar policy.
- **Não tocar sem combinar:** `Cobranca.tsx`, `DisparosMonitor.tsx`, `funil-*`,
  `aquecimento-*` (fora do escopo e sensíveis a operação ao vivo).
