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
| — | Codex | C2 `BalancoConfigForm.tsx` | a fazer |
