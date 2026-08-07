# Cobrança manual (fora do sistema) + previsão de pagamento por parcela

## Problema

Às vezes o operador cobra o aluno pelo próprio WhatsApp pessoal, fora do sistema (sem passar pela
Evolution API). Hoje não existe jeito de registrar isso: o sistema automático pode mandar a mesma
cobrança de novo (nenhum registro impede), e o novo indicador "Cobrado ..." do card da Fila (ver
[2026-08-07-cobranca-indicador-ultimo-contato-design.md](./2026-08-07-cobranca-indicador-ultimo-contato-design.md))
não aparece, porque não existe log nenhum desse contato.

Além disso, quando o aluno dá uma previsão de pagamento (\"pago sexta\"), não há onde anotar isso
ligado à parcela -- fica só na cabeça do operador ou solto numa conversa.

São duas necessidades relacionadas, mas independentes uma da outra.

## Peça 1 — "Marcar como cobrado"

Botão novo no `AlunoFilaCard` (`src/components/crm/Cobranca.tsx`), ao lado do botão "Ver mensagem"
existente (por volta da linha 372-375). Um clique, sem formulário.

### Comportamento
Cobre exatamente o mesmo conjunto de parcelas que o envio manual ("Ver mensagem" → "Enviar agora")
cobre hoje: `grupo.elegiveis` (fallback pra `grupo.parcelas` se `elegiveis` vier vazio -- mesma regra
já usada em `enviarManual`, linha ~1058). Isso conta como uma cobrança "de verdade" pro sistema:
- Impede o automático de mandar a mesma fase de novo (mesmo índice único de dedupe que já existe).
- Alimenta o badge "Cobrado ontem, HH:MM" / "Respondeu" do card (a resposta futura, se o aluno
  responder no WhatsApp pessoal do operador, **não** vai aparecer como "Respondeu" -- isso só é
  possível quando a conversa passa pela Evolution API. Fora de escopo resolver isso agora.)

### Onde grava
Estende a edge function `enviar-cobranca` (`supabase/functions/enviar-cobranca/index.ts`) com um novo
modo, checado antes dos branches existentes em `serve()`:

```ts
if (body.marcar_manual) {
  return await marcarCobradoManual(db, body, userId, corsHeaders);
}
```

`marcarCobradoManual` recebe `{ aluno_id, aluno_nome, telefone, cobertura }` (cobertura no mesmo
formato `{ pagamento_id, template_id }[]` que `enviarManual` já monta) e insere direto em
`cobranca_logs`, sem chamar `sendViaEvolution`:

```ts
async function marcarCobradoManual(db, body, userId, cors) {
  const { aluno_id, aluno_nome, telefone, cobertura } = body;
  const grupoEnvioId = cobertura.length > 1 ? crypto.randomUUID() : null;
  const agora = new Date().toISOString();
  const { error } = await db.from('cobranca_logs').insert(
    cobertura.map((c: { pagamento_id: string; template_id: string | null }) => ({
      aluno_id, pagamento_id: c.pagamento_id, aluno_nome, telefone,
      mensagem: 'Cobrança feita manualmente pelo WhatsApp pessoal do operador.',
      template_nome: 'Manual (fora do sistema)', template_tipo: null, template_id: c.template_id,
      status: 'enviado', manual: true, enviado_por: userId,
      enviado_em: agora, agendado_para: agora, grupo_envio_id: grupoEnvioId,
    })),
  );
  if (error) {
    const jaReservado = error.code === '23505';
    return new Response(JSON.stringify({
      error: jaReservado
        ? 'Essa fase já foi cobrada por outro processo nesse meio tempo -- atualize a fila.'
        : error.message,
    }), { status: jaReservado ? 409 : 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}
```

Reaproveita o índice único `ux_cobranca_logs_pagamento_template_ativo` que já existe -- mesma
proteção contra dedupe/corrida que o resto do sistema usa, sem precisar de migration nova pra essa
peça.

### Frontend
Nova função `marcarCobradoManual(grupo: AlunoGrupo)` em `Cobranca.tsx`, ao lado de `enviarManual`:
monta `cobertura` do mesmo jeito (`base.map(p => ({ pagamento_id, template_id: templateParaOffset(p.dias_offset)?.id ?? null }))`),
faz o POST com `{ marcar_manual: true, aluno_id, aluno_nome, telefone, cobertura }`, mostra
`toast.success('Marcado como cobrado!')` ou `toast.error` em caso de 409/erro, e recarrega `logs`
(`loadAll()` ou só o fetch de logs, o que já existir de mais leve) pra o badge "Cobrado ..." aparecer
na hora.

Botão: `<Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => marcarCobradoManual(grupo)}><Check size={12}/>Marquei que cobrei</Button>`.

## Peça 2 — Previsão de pagamento por parcela

### Dados
Nova migration, uma coluna:
```sql
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS data_prevista_pagamento DATE;
```
Por parcela (não por aluno) -- cada parcela em aberto pode ter sua própria previsão, ou nenhuma
(`NULL`, quando o aluno não deu estimativa). Fica pronta pra ser preenchida também pela IA de
cobrança (`cobranca_ia_conversas` / `cobranca-ia-responder`) no futuro -- não implementado agora, só
não queremos uma coluna cujo formato tenha que mudar quando isso acontecer.

Nota: já existe uma coluna parecida, `pagamentos.cobranca_contatado_em`, usada só no painel de
tarefas da Bia (`Equipe11ds.tsx`) como um toggle simples "contatei sim/não" -- não tem relação com o
dedupe da cobrança automática e não será reaproveitada aqui (fluxo diferente, sem necessidade de
juntar os dois).

### UI — definir/editar
Nos chips de parcela do `AlunoFilaCard` (`grupo.parcelas.map(...)`, linha ~360-369), quando
`p.dias_offset > 0` (parcela vencida), o chip ganha um ícone de calendário clicável. Abre um
`Popover` (shadcn, já usado em outros lugares do projeto) com um único `<input type="date">`
opcional + botões "Salvar" e "Limpar". Salvar faz:
```ts
await supabase.from('pagamentos').update({ data_prevista_pagamento: data || null }).eq('id', p.pagamento_id);
```
direto do cliente (mesmo padrão já usado em `Financeiro.tsx`/`Equipe11ds.tsx` para updates simples em
`pagamentos` -- sem necessidade de edge function, não afeta dedupe nem elegibilidade). Atualiza o
estado local da fila (`fila` state) pra refletir sem precisar recarregar a página.

Chip passa a mostrar, quando preenchido: `#2 · R$ 109,90 · venceu 30/05/2026 · previsto 15/08`.
Editável e removível a qualquer momento, sem relação com "Marcar como cobrado" -- são ações
independentes, cada uma dispara sozinha.

### UI — exibir na ficha do aluno
Coluna nova "Previsão" (somente leitura), populada a partir de `pagamentos.data_prevista_pagamento`:
- `FichaAlunoResumo.tsx`: adicionar `<th>Previsão</th>` / `<td>{fmtDate(p.data_prevista_pagamento)}</td>`
  na tabela de parcelas existente (linha ~227-246), incluindo o campo no `select` da query
  (linha ~128) e na interface `ParcelaFicha` (linha ~47-54).
- `Financeiro.tsx`: mesma coisa na tabela de parcelas **modo visualização** da ficha do aluno
  (linha ~3673-3714) -- **não** mexer na "Tabela modo edição" (linha ~3718 em diante), que é a parte
  sensível/sem cobertura de teste desse arquivo. Só leitura, sem input.

## Fora de escopo
- Marcar "Respondeu" quando o aluno responde no WhatsApp pessoal do operador (só é possível quando a
  conversa passa pela Evolution API, que é o que alimenta `evo-resposta`).
- IA preencher `data_prevista_pagamento` sozinha -- o campo fica pronto, a integração fica pra depois.
- Editar a previsão de pagamento a partir da ficha do Financeiro (fica só na Cobrança).
- Desfazer "Marcar como cobrado" depois de clicado (se precisar, edita direto no banco por enquanto).

## Testes
- `npx tsc --noEmit` limpo.
- No navegador: clicar "Marquei que cobrei" num aluno da fila -- confere que o badge "Cobrado hoje,
  HH:MM" aparece, e que o card some da lista de elegíveis se não sobrar nenhuma parcela pendente de
  fase nova (mesma regra que já existe pro envio manual).
- Clicar de novo em "Marquei que cobrei" pro mesmo aluno/fase -- confere que dá erro 409 tratado (não
  duplica log).
- Definir uma previsão de pagamento numa parcela vencida -- confere que aparece no chip, na ficha do
  Chat e na ficha do Financeiro (modo visualização). Limpar a data e confirmar que some dos três
  lugares.
- Confirmar que o ícone de previsão **não** aparece em parcelas não vencidas (`dias_offset <= 0`).
