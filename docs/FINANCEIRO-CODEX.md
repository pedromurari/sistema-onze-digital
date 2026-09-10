# Handoff para o Codex — trabalhar junto no Financeiro

Você (Codex) e o Claude vão tocar o projeto de estruturação do financeiro em paralelo.
Este arquivo é o ponto de sincronização. **Leia `docs/FINANCEIRO.md` primeiro** — lá está
todo o contexto, as decisões travadas, o schema e o roadmap. Aqui é só como não colidir.

---

## Como a gente divide

| | Claude | Codex (você) |
|---|---|---|
| Território | **edições nos arquivos grandes existentes** (`Financeiro.tsx`, `Balanco.tsx`, `financial-utils.ts`, edge functions Asaas) | **componentes novos / isolados** e libs de apoio |
| Por quê | tem o contexto de como essas telas carregam dado e fazem baixa | arquivo novo = zero risco de merge conflict com o Claude |

Regra de ouro: **um arquivo tem um dono por vez.** Se precisar mexer num arquivo do
território do outro, anota em "Log de coordenação" no fim deste arquivo antes de começar.

---

## Suas tarefas (Codex) — nesta ordem

### TAREFA C1 — Painel "Notas Fiscais" (novo, prioridade alta)
Arquivo novo: `src/components/crm/finance/NotasFiscais.tsx`. Registrar no `Sidebar.tsx`
(grupo Financeiro, key nova `financeiro_notas`) e no switch de telas do `CRMLayout.tsx`.

O quê:
- Lista as parcelas pagas com `nf_status = 'nao_emitida'` (usar o hook `usePagamentos` da
  camada `src/lib/db` + join com aluno; **não** `supabase.from()` para leitura).
- Colunas: aluno, produto, competência (`mes_referencia`), valor, conta (`conta_recebimento`),
  data de pagamento. Ordenar por competência asc.
- Ações por linha: **"Marcar emitida"** (abre input p/ `nf_numero` e `nf_link`, grava
  `nf_status='emitida'`, `nf_emitida_em=now()`), **"Dispensar"** (`nf_status='dispensada'`,
  pede motivo em `observacoes`). Mutation direta em `pagamentos` + `useInvalidarDados('pagamentos')`.
- Filtro por competência (mês) e por produto. Contador no topo: "X notas a emitir · R$ Y".
- Aba secundária "Emitidas" (nf_status='emitida') só leitura, com link.
- Contexto de negócio no cabeçalho da tela (texto curto): a emissão em si é feita no painel
  da **Agilize** (Notas serviço → Emitir nota); este painel é o **controle** do que já saiu.
  CNAE 8599-6/04, atividade 05762.

Não faça: integração de API de emissão (fica pra depois, decisão do Pedro).

### TAREFA C2 — Form de configuração do Balanço (`balanco_config`)
Arquivo novo: `src/components/crm/finance/BalancoConfigForm.tsx`, usado dentro da aba
"Config" do `Balanco.tsx` (o Claude te dá o ponto de montagem; por ora deixe exportado e
testável isolado).

O quê — edita a linha `balanco_config` id `onze_digital`, campos hoje vazios:
- `socios` (jsonb): lista `{ nome, percentual }`. Soma deve dar 100%.
- `taxas` (jsonb): consolida o que hoje está em `payment_method_rates` — deixe um editor
  simples `{ conta, forma, percentual, fixo }`.
- `parametros_cfo` (jsonb): já tem shape em `financial-utils.ts::ParametrosCfo`
  (`impostos_pct`, `cac_estimado`, `gross_margin_pct`, `saldo_caixa_manual`,
  `reserva_emergencia_meta_meses`). Reaproveite `CfoParametrosConfig.tsx` como referência.
- **Novo:** `saldo_inicial_contas` (jsonb): `{ inter, c6, mercado_pago, asaas, voomp }` em R$,
  com data. É o ponto de partida da conciliação de caixa.
- Os valores reais (saldos, %, alíquota) vêm do Pedro depois — o form só precisa existir e
  gravar. Precisa de migração pra adicionar `saldo_inicial_contas`? Faça o arquivo de
  migração (`AAAAMMDDHHMMSS_balanco_config_saldo_inicial_contas.sql`) mas **não aplique** —
  deixe pro Claude aplicar via MCP depois de revisar.

### TAREFA C3 — Utilitário de contas
`src/lib/contas.ts` (novo): a lista canônica das 6 contas
(`inter`, `c6`, `mercado_pago`, `asaas`, `voomp`, `outro`) com `label` PT, cor, e helpers
(`isConta`, `CONTA_LABELS`, `CONTAS` array). O Claude e você vão importar disso nos
seletores. Pequeno, sem dependência — faça primeiro, é o desbloqueio dos seletores.

### TAREFA C4 — Regras do DRE por sócio configuráveis (prioridade média)

**Contexto:** a tela **Sócios** (`src/components/crm/finance/Socios.tsx`) mostra a cota
de cada sócio no mês = *receita dele − custo dele*, calculada por
`src/lib/financial-utils.ts::calcDrePorSocio`. Hoje as regras de divisão estão
**hardcoded** dentro dessa função e em `fracaoPedroReceitaOutra`. Ver a memória de
projeto e o Raio-X (§ "Divisão de turmas e sócios") pro modelo. Empresa tem 2 sócios:
**Pedro** (= bucket "Onze Digital" no motor de repasse) e **Rodrygo** (= "IDM").

**Regras hoje embutidas (o default tem que continuar idêntico a isto):**
- Mensalidades → `calcRepasses` (turma manda: IDM=Rodrygo, Onze Digital=Pedro, Keila=investidor). **Isso não muda, continua vindo do motor de repasse.**
- Eventos NPA (`vw_receita_eventos_mes`) → **50/50** Pedro/Rodrygo.
- `balanco_itens` tipo=entrada (receita fora do CRM), por `fornecedor`:
  `zaffalon`→100% Pedro · `dksoft`→100% Rodrygo · `life sorrisos`→100% Rodrygo · `pnl`→50/50 · default→50/50.
- Custos (`balanco_itens` tipo=saida):
  - `repasse_investidor`, `pro_labore`, `distribuicao_lucro`, `estorno` → **não entram**.
  - `taxa_gateway` com fornecedor contendo `voomp` → **100% Rodrygo** (dedicado).
  - `custo_produto` com `produto = 'idm-pelo-brasil'` → **50/50** (custo de evento).
  - `custo_produto` (resto = professoras) → rateado pela **proporção da receita de mensalidade** de cada sócio (`fracaoPedroPsi`).
  - resto (ads, software, contabilidade, adm, financeiro, imposto, comissao, folha, custo_fixo, taxa_gateway não-Voomp) → **50/50**.

**O que fazer:**

1. **Coluna já existe:** `balanco_config.regras_socio jsonb not null default '{}'`
   (migração `20260910..._balanco_config_regras_socio.sql` já aplicada pelo Claude).
   Adicione `regras_socio` ao `COLUNAS_BALANCO_CONFIG` em `src/lib/db/balanco-config.ts`.

2. **Arquivo novo `src/lib/regras-socio.ts`:**
   - `interface RegrasSocio` com o shape editável. Sugestão:
     ```ts
     {
       eventos_npa_pct_pedro: number;              // default 50
       custo_fixo_pct_pedro: number;               // default 50
       custo_evento_pct_pedro: number;             // default 50
       professoras_por_proporcao_mensalidade: boolean; // default true
       receita_outra_default_pct_pedro: number;    // default 50
       receita_outra_por_fornecedor: { match: string; pct_pedro: number }[];
         // default: [{zaffalon,100},{dksoft,0},{life sorrisos,0},{pnl,50}]
       custo_dedicado_por_fornecedor: { match: string; socio: 'pedro'|'rodrygo' }[];
         // default: [{voomp, rodrygo}, {google workspace, rodrygo}]
         // (nota: já tem `balanco_itens` "Google Workspace (Meet)" marcado 100% Rodrygo)
     }
     ```
   - `REGRAS_SOCIO_DEFAULT` com exatamente os valores de hoje.
   - `normalizarRegrasSocio(jsonb): RegrasSocio` (merge com o default, tolerante a lixo — mesmo padrão de `normalizarParametros`).

3. **`calcDrePorSocio` (em `financial-utils.ts` — território do Claude, handover no log):**
   ganha um param opcional `regras: RegrasSocio = REGRAS_SOCIO_DEFAULT`. Troca os `/2` e o
   `fracaoPedroReceitaOutra` por leituras de `regras`. Sem mudar a assinatura de forma
   quebrada — param novo no fim, com default. O comportamento com o default TEM que ser
   bit-a-bit igual ao de hoje (tem teste? senão, escreva um mínimo em
   `financial-utils.test.ts` fixando o resultado de agosto antes de refatorar).

4. **`Socios.tsx` (handover no log):** buscar `regras_socio` junto do resto do `balanco_config`
   e passar `normalizarRegrasSocio(config.regras_socio)` pro `calcDrePorSocio`.

5. **`BalancoConfigForm.tsx` (handover no log):** novo card **"Divisão entre sócios"** —
   campos pros %/booleans + editores de lista pros dois arrays (mesmo estilo do card de taxas).
   Salvar junto no mesmo `update` do form (adicionar `regras_socio` ao payload).

**Não faça:** mexer no `calcRepasses` nem no motor de turma. Não trocar `Socios.tsx` por
`supabase.from()` — ela já usa `supabase` direto porque o DRE não tem hook (ok manter).
Vazio (`{}`) tem que continuar funcionando (= default = comportamento atual).

---

## O que NÃO fazer

- Não rodar migração (`apply_migration`) nem backfill de risco — escreva o `.sql`, o Claude
  aplica depois de revisar com o Pedro.
- Não mexer no fiscal (regularização Simples/PGDAS/NFS-e é com a Agilize, não é código).
- Não tocar `Cobranca.tsx`, `DisparosMonitor.tsx`, `funil-*`, `aquecimento-*`.
- Não afrouxar RLS. Não trocar leitura por `supabase.from()` — use os hooks de `src/lib/db`.
- Não "consertar" erros de type fora do financeiro (o baseline está poluído por outro WIP).

## Como validar antes de entregar

```
npm run typecheck      # não pode aumentar a contagem de erros
npm test               # vitest
```

Comentários em português, densos, explicando o porquê (padrão do repo).

---

## Log de coordenação (edite aqui ao pegar/soltar um arquivo)

| Quando | Quem | Arquivo(s) | Status |
|---|---|---|---|
| 2026-09-08 | Claude | `Financeiro.tsx`, `types.ts`, migração 1.2 | concluído (não commitado) |
| 2026-09-08 | Codex | C3 `src/lib/contas.ts`, `src/lib/contas.test.ts` | concluído; typecheck sem erros nos arquivos novos (baseline global 77→84 já documentado); 58 testes passando |
| 2026-09-08 | Codex | C1 `NotasFiscais.tsx`, registros em `Sidebar.tsx`, `CRMLayout.tsx` e `access-control.ts` | concluído; typecheck sem erros nos arquivos da C1 (84 globais preexistentes); 58 testes passando |
| 2026-09-08 | Codex | C2 `BalancoConfigForm.tsx`, hook `src/lib/db/balanco-config.ts`, chaves de cache e `20260908150000_balanco_config_saldo_inicial_contas.sql` | concluído; migration escrita e não aplicada; typecheck sem erros da C2 (84 globais preexistentes); 58 testes passando |
| 2026-09-08 | Claude | 1.2-UI A/A2/B `Balanco.tsx`+`Financeiro.tsx`; migração 1.2 aplicada (MCP) | concluído (`5792005`, `b946013`) |
| 2026-09-08 | Claude | **corte fiscal** — migrações `20260908150000` (do Codex) + `20260908160000` (`inicio_operacao_fiscal`=2026-09-01) **aplicadas via MCP**; `NotasFiscais.tsx` filtra a fila por `data_pagamento >= inicio_operacao_fiscal`; `balanco-config.ts` COLUNAS + `types.ts` atualizados | concluído (`1276a68`) — princípio "nada retroativo" no topo de `FINANCEIRO.md` |
| 2026-09-08 | Claude | monta `BalancoConfigForm` na aba Config do `Balanco.tsx` | concluído (`012f88b`) |
| 2026-09-10 | Claude | Fase B/C: `Socios.tsx` (novo), `calcDrePorSocio`/`calcDreResumoMes` em `financial-utils.ts`, `vw_receita_eventos_mes` (migração aplicada), DreCompetencia lê a view, `BalancoConfigForm` ganhou pró-labore/reserva/frequência. **Mergeado em `main`.** | concluído |
| 2026-09-10 | Claude→Codex | **HANDOVER pra C4:** `financial-utils.ts` (só a função `calcDrePorSocio` + as constantes de regra), `Socios.tsx` e `BalancoConfigForm.tsx` liberados pro Codex fazer a C4. Claude não toca nesses até a C4 entrar. Migração `..._balanco_config_regras_socio.sql` (coluna `regras_socio`) **já aplicada** pelo Claude. | Codex pega |
| 2026-09-10 | Codex | C4 `regras-socio.ts`, `calcDrePorSocio`, `Socios.tsx`, `BalancoConfigForm.tsx`, `balanco-config.ts` e testes | em andamento; arquivos assumidos conforme handover acima |
