# Projeto: Estruturação do Financeiro — Onze / IDM

Documento de trabalho (técnico) do projeto de unificação do financeiro. Vive no repo,
cresce a cada avanço. O documento "de negócio" equivalente é o artifact **Manual do
Financeiro**: https://claude.ai/code/artifact/21a7ffb8-50c9-4760-bae6-cbda0331dc17

> Atualizado: 2026-09-10 · Branch: `financeiro-estruturacao` · Supabase: `usqiyekfmwwnvkmkdlej`
>
> **Raio-X Financeiro** (business, ago/set): https://claude.ai/code/artifact/9af18481-dc7f-4301-9f06-09e8768b7bda

---

## 1. Objetivo

Sair de um financeiro "largado" para uma função financeira operável por uma auxiliar:
dado confiável e único entre telas, DRE por competência conectado à contabilidade
(Agilize / Simples Nacional), rotina diária/semanal/mensal definida, nota fiscal em dia.

Entregável final: sistema + Manual do Financeiro fechado → contratar auxiliar financeira.

---

## 2. Contexto fixo (decisões travadas — não reabrir sem o Pedro)

> **NADA RETROATIVO.** Decisão do dono do produto (2026-09-08): não criar/alterar
> notas, pagamentos ou repasses antigos. Estrutura é para o futuro. Toda automação
> (fila de NFS-e, conciliação, repasse recalculado, geração/cobrança via Asaas)
> filtra por `balanco_config.inicio_operacao_fiscal` (**2026-09-01**) e só age no que
> vier a partir dessa data. O histórico anterior **continua visível** nas telas de
> sempre — não é escondido nem apagado, só não entra nas filas de automação.


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
| 2026-09-08 | **A2** (`b946013`) — Balanço e Financeiro consomem `src/lib/contas.ts`. |
| 2026-09-08 | **Codex** — `494b021` painel Notas Fiscais (C1), `c2fe749` BalancoConfigForm + `src/lib/db/balanco-config.ts` (C2). |
| 2026-09-08 | **Corte fiscal** — migrações `20260908150000` (`saldo_inicial_contas`) e `20260908160000` (`inicio_operacao_fiscal` = 2026-09-01) aplicadas. `NotasFiscais.tsx` passa a filtrar a fila por `data_pagamento >= inicio_operacao_fiscal` — as 698 parcelas antigas não entram. `types.ts` + `COLUNAS_BALANCO_CONFIG` atualizados. |
| 2026-09-10 | **Reconciliação ago/set** (madrugada, autônomo). Parser dos 5 extratos (`scratchpad/parse.py`, 568 lançamentos). DRE reconstruído: descoberto que o DRE **não lia a receita dos eventos NPA** (`npa_evento_leads`: ingressos + material + matrículas) — ~R$17,8k em agosto. Agosto passou de "−R$4,7k" (leitura errada) para **+R$12,9k**. Lançados em `balanco_itens` (competência ago/set): receita de eventos NPA, DKSoft net-new, PNL à vista; custos professoras (Jocimara Anjos R$1.730 + Amanda Calux R$970 = `custo_produto`), Keila 50% competência R$989,45, Meta BR/USD, software, DARF, retiradas Pedro R$7.460 (`pro_labore` não segregado), Igor R$1.376 (`folha`). Voomp/Anhanguera = parcelas de psi c/ extensão universitária, JÁ no CRM a bruto — não somar. DKSoft cross-check: 7 dos 21 alunos de ago já no CRM. |
| 2026-09-10 | **Fase B+C** (commit `bba84e0`). `balanco_config.socios` agora `{nome, percentual, prolabore_mensal, conta}` + `parametros_cfo` ganha `reserva_minima_operacional` e `prolabore_frequencia` (semanal/quinzenal/mensal). `BalancoConfigForm` edita os novos campos. Nova tela **Sócios** (`financeiro_socios`, `src/components/crm/finance/Socios.tsx`): conta virtual por sócio/mês — pró-labore devido×repassado×falta, cota de lucro (do DRE fechado)×distribuído×falta, botão "registrar repasse" → `balanco_itens` (`pro_labore`/`distribuicao_lucro`, `fornecedor`=nome). Distribuição só habilita c/ DRE fechado; trava quando caixa < reserva mínima. `socios` populado: Pedro/Rodrygo 50/50, contas inter/c6, freq semanal (valores de pró-labore a preencher). |
| 2026-09-10 | **DRE melhorado** (commit `91d5b70`). `DreCompetencia`: `balanco_itens` tipo=entrada (`receita_curso`/`receita_outra`/`matricula`/`outro_entrada`) soma na Receita bruta como "Receita fora do CRM"; `balanco_itens` categoria `taxa_gateway` (Vega/Pagar.me/tarifa MP) agora entra na linha de taxas (antes só `pagamentos.taxa_valor` contava). |

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
- [x] 1.4 `balanco_config` — form de sócios (nome, %, **pró-labore mensal**, **conta**) +
      saldo inicial por conta + alíquota efetiva do Simples + **reserva mínima operacional** +
      **frequência do pró-labore**. Feito (commit `bba84e0`). Falta o Pedro **preencher os valores**.
- [ ] 1.5 Higiene — corrigir 4 alunos sem turma, 6 sem forma, 90 parcelas sem forma, 91
      "pago R$0" → `isento`. Pôr `integridade_financeira` na rotina.

### Fase 2 — DRE + Agilize
- [x] **2.1** Tela `DreCompetencia.tsx` (`financeiro_dre`) — DRE por competência: receita bruta
      por produto → (–) impostos (DAS real de `balanco_itens 'imposto'`, fallback % config)
      → (–) taxas de gateway (`pagamentos.taxa_valor` real) → receita líquida → custos diretos
      → margem → despesas fixas → EBITDA → não operacional → resultado. Navegação por mês.
      Commit `7f30c40`.
- [x] **2.2** Fechar o mês — snapshot imutável em `dre_fechamentos` (migração `20260908190000`).
      Botão Fechar/Reabrir na tela de DRE; mês fechado mostra o snapshot congelado. Commit `9aeb5a5`.
- [ ] **2.3** Exportação no formato do pacote mensal Agilize + campo p/ o retorno (DAS apurado).
- [x] **2.4 (Voomp)** Tela `ConciliacaoVoomp.tsx` (`financeiro_conciliacao`) — cola o extrato
      da Voomp, casa venda × parcela paga por turma + data, grava `conta_recebimento='voomp'`
      + `taxa_valor` real (bruto − líquido). Mostra saques (caixa real) e vendas sem baixa.
      Commit `70afe13`.
- [ ] **2.4 (Asaas/MP/C6/Inter)** conciliação das outras contas — Asaas já grava taxa via
      webhook; falta a visão de extrato × sistema por conta.

### Fase C — Sócios: pró-labore + distribuição (feito 2026-09-10)
- [x] Tela `Socios.tsx` (`financeiro_socios`) + config estendida. Ver changelog.
- [ ] Pedro preenche pró-labore de cada sócio + reserva mínima na Config.
- [ ] Ligar o número real do caixa (hoje `parametros_cfo.saldo_caixa_manual` é manual) —
      idealmente somar `saldo_inicial_contas` + movimento do período por conta.
- [ ] Alerta/relatório: repasse semanal previsto vs pago; "pode distribuir R$ X" pós-fechamento.

### Fase 3 — A pagar / a receber
- [ ] Agenda semanal (contas fixas + comissões + repasses + pró-labore semanal).
- [ ] Régua de inadimplência. Extrato do investidor.
- [ ] Asaas: negativação (Serasa) — decisão de política + config.
- [ ] **Eventos NPA no DRE:** hoje a receita vem do `npa_evento_leads` lançada à mão em
      `balanco_itens`. Automatizar: um trigger/rotina que soma ingressos+material+matrículas
      por evento finalizado e gera/atualiza a linha de receita. Cuidado com dupla contagem
      quando o matriculado virar aluno com parcela no CRM.
- [ ] **DKSoft → Asaas:** migrar a coorte legada (21+ alunos, boleto via PJBank→C6) e
      desligar o DKSoft. Enquanto não migra, a receita entra como `balanco_itens` mensal.

### Fase 4 — Cockpit + entrega
- [ ] Dashboard financeiro único. Manual fechado. Perfil de acesso da auxiliar (RLS).

### Paralelo — Asaas (só alunos NOVOS; atuais continuam na Voomp)
- [x] `matricula-boleto-mensal-gerar` generalizado atrás da trava `balanco_config.asaas_novos_ativo`
      (começa `false`). Quando `true`: cobre qualquer origem, só `data_matricula >= inicio_operacao_fiscal`
      (atuais ficam de fora por construção); **aluno novo paga 100% das parcelas pelo Asaas**;
      valor/qtd de `pagamentos.valor`/`total_mensalidades`. Migrações `20260908170000` (`asaas_novos_ativo`)
      e `20260908180000` (dropa `parcela_voomp_extensao` — modelo errado, ver abaixo).
- [ ] **Extensão Anhanguera:** boleto SEPARADO na Voomp, no nome do aluno, que a **empresa paga por
      fora** pra registrar o vínculo. Não é parcela do aluno, não passa por `pagamentos`. É despesa da
      empresa — lançar em `balanco_itens` (conta `voomp`) quando acontecer. (Automação disso: a definir.)
- [ ] **Ativar:** Pedro seta `asaas_novos_ativo = true` + redeploy da edge function (revisar antes).
- [ ] `POST /payments` com `fine` (multa) + `interest` (juros) — depende da cláusula do
      contrato (padrão: multa 2% + juros 1% a.m.).
- [ ] Webhook: conciliar valor recebido > valor da parcela (multa/juros efetivos).

---

## 7. Pendências externas (não bloquear o resto)

- **Pedro:** **pró-labore mensal de cada sócio + reserva mínima** (Config financeira);
  nº de turmas ativas por professora (Jocimara/Amanda/Renata); % que a Anhanguera retém na
  extensão universitária; lista de quem comprou o PNL Master (ele + a mãe venderam);
  custos de cada evento NPA (locação, deslocamento, professor convidado, ads do evento);
  gastos PF fixos de cada sócio; cláusula de multa/juros do contrato.
- **Agilize (pauta pronta no Raio-X §3):** formalizar pró-labore **desde setembro** (Fator R
  → Anexo III ~6% vs Anexo V ~15,5%, economia ~R$1,8k/mês); retificar PGDAS atrasados com
  pró-labore retroativo se possível; CNAE secundário p/ consultoria de marketing (Onze
  Digital/Zaffalon) e palestras (Life Sorrisos); NFS-e a partir de setembro.

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
