# Redesign do sistema de Cobrança — design

Data: 2026-08-03
Componentes: `src/components/crm/Cobranca.tsx`, `supabase/functions/enviar-cobranca/index.ts`, RPC `get_alunos_para_cobranca`, tabela `cobranca_logs`.

## 1. Problema

Investigação no banco de produção (`usqiyekfmwwnvkmkdlej`) confirmou três causas raiz, mais uma queixa visual:

1. **"Esquece quem está inadimplente"** — a RPC `get_alunos_para_cobranca` não devolve `pagamento_status`. O frontend depende desse campo (`FilaItem.pagamento_status`) para o badge vermelho de inadimplente, o KPI "inadimplentes" e o resumo do modal de disparo em lote. Como o campo nunca vem preenchido, ninguém nunca é marcado como inadimplente na tela — mesmo recebendo cobrança de verdade.
2. **Reenvio duplicado da mesma janela** — o dedupe de "já cobrei essa fase" é um `SELECT count()` antes do `INSERT`, sem constraint no banco. Confirmado nos dados: 3 pares `(pagamento_id, template_id)` com 2 envios `enviado` cada, horas de diferença (28–29/07). Sob concorrência (tick automático + "Disparar agora" manual, ou dois ticks sobrepostos), os dois processos passam pela checagem antes de qualquer um gravar.
3. **Templates não cobrem quem tem mais de 1 parcela em aberto** — os 8 templates ativos falam de "sua parcela {{parcela}}" no singular. Cada parcela atrasada entra na fila como item independente; um aluno com 2+ parcelas recebe 2+ mensagens separadas em vez de uma consolidada.
4. **Visual não profissional** — fila é uma tabela plana por parcela, sem agrupar por aluno nem hierarquia visual de gravidade.

## 2. Decisões já validadas com o usuário

- Consolidação: **sempre 1 mensagem por aluno** quando há 2+ parcelas em aberto (nunca uma por parcela).
- Tom da mensagem consolidada: o **template da fase mais crítica** (parcela com mais dias de atraso), listando as demais parcelas dentro dela — não separa por fase.
- Templates: **reaproveitar os 8 templates existentes**, adicionando variáveis novas (`{{qtd_parcelas}}`, `{{total_devido}}`, `{{lista_parcelas}}`) e um bloco condicional (`{{#multiplas}}...{{/multiplas}}`, já suportado pelo motor de template) que só aparece quando há mais de uma parcela — não criar um tipo de template novo.
- Visual da Fila: **cards por aluno** (opção A validada com mockup) — nome, telefone, total devido, borda colorida por gravidade, parcelas como chips, ação de ver/enviar mensagem.
- Histórico: também **agrupado por aluno** (mesmo padrão de card), expansível para ver cada envio individual — não fica mais como log cronológico plano.
- Entrega: **tudo num pacote só** (bugs de dados + consolidação + visual novo), não por etapas.
- Antes de ir pra produção, revisar o texto exato do complemento adicionado aos 8 templates (mudança de copy client-facing).

## 3. Mudanças de dados

### 3.1 `get_alunos_para_cobranca`
Adiciona `p.status AS pagamento_status` ao `RETURNS TABLE` (requer `DROP FUNCTION` + `CREATE`, igual à migration anterior que já fez isso). Mesma lógica de filtro, sem mudança de comportamento — só passa a devolver o dado que já existia em `pagamentos.status` e que o frontend já esperava.

### 3.2 `cobranca_logs`
- Nova coluna `grupo_envio_id uuid NULL` — todas as linhas de log geradas por um mesmo envio consolidado (1 por `pagamento_id` coberto) compartilham o mesmo `grupo_envio_id`, para a UI reconstruir "isso foi 1 mensagem" mesmo tendo N linhas.
- Novo índice único parcial: `ux_cobranca_logs_pagamento_template_ativo ON cobranca_logs (pagamento_id, template_id) WHERE status IN ('pendente', 'enviado')`. Isso é o que fecha a race: dois processos concorrentes não conseguem mais os dois passar pela checagem "ainda não enviei essa fase" — o segundo INSERT falha com unique_violation e aquele processo desiste de enviar pra aquele pagamento (em vez de mandar duplicado).

## 4. Lógica de agrupamento e envio (edge function)

Troca `proximoEnvioElegivel` (por parcela) por uma função que:

1. Agrupa a fila (retorno de `get_alunos_para_cobranca`) por `aluno_id`.
2. Para cada aluno, calcula quais parcelas estão **elegíveis** (mesma regra de hoje: não existe log `enviado` para aquele `pagamento_id` + o `template_id` que casa com a fase atual dela).
3. Se nenhuma parcela do aluno está elegível, pula o aluno.
4. Se 1+ está elegível, escolhe a **parcela elegível mais crítica** (maior `dias_offset` positivo; se nenhuma vencida, a mais próxima de vencer) como base do template/tom.
5. Monta as variáveis: as de sempre (`nome`, `valor`, `parcela`, `vencimento`, `dias_atraso`, `link_pagamento`) vêm da parcela crítica; `qtd_parcelas` e `total_devido` somam **todas** as parcelas em aberto do aluno (elegíveis ou não — reflete a dívida real); `lista_parcelas` lista as outras parcelas (excluindo a crítica); `multiplas` é `true` quando `qtd_parcelas > 1`.
6. Insere N linhas em `cobranca_logs` (uma por `pagamento_id` coberto pela mensagem, cada uma com o `template_id` que casa com a fase daquela parcela específica), status `pendente`, mesmo `grupo_envio_id`, mesmo `mensagem`. Se qualquer insert colidir com o índice único (outro processo já reservou aquela fase daquele pagamento), aborta o envio deste aluno inteiro sem mandar WhatsApp — evita mandar metade da dívida numa mensagem e duplicar a outra metade depois.
7. Envia 1 mensagem via Evolution; atualiza as N linhas para `enviado`/`erro` juntas.

Modo tick continua mandando no máximo 1 mensagem por chamada (agora 1 aluno, não 1 parcela). Modo bulk (`processarFilaAutomatica`) itera por grupo de aluno, removendo do restante todos os `pagamento_id` cobertos a cada envio.

`enviarManual` passa a aceitar `pagamento_ids: string[]` (mantendo compatibilidade: se vier só `pagamento_id` singular, trata como array de 1) para o envio manual pelo card também poder cobrir múltiplas parcelas de uma vez.

## 5. Templates

Adiciona um bloco a cada um dos 8 templates ativos, por exemplo:

```
{{#multiplas}}

Além dessa, você tem outras parcelas em aberto:
{{lista_parcelas}}

Total geral em aberto ({{qtd_parcelas}} parcelas): R$ {{total_devido}}
{{/multiplas}}
```

Vou aplicar essa mudança de copy nos 8 templates via migration, e mostrar o texto final de cada um antes de aplicar em produção (é mensagem que vai pro WhatsApp de aluno real).

## 6. Frontend (`Cobranca.tsx`)

- **Fila**: troca a tabela plana por lista de cards por aluno (padrão validado): avatar/inicial, nome, telefone, total devido, badge de situação usando `pagamento_status` (agora correto), chips com cada parcela em aberto, botão "Ver mensagem consolidada" (abre o modal de envio já existente, adaptado pra mostrar a mensagem com todas as parcelas) e "Enviar agora" por aluno.
- **KPIs**: "Inadimplentes" volta a contar de verdade; adiciona "Total em aberto (R$)"; "Na fila hoje" passa a contar alunos, não parcelas.
- **Modal de disparo em lote**: contagem em alunos, não parcelas.
- **Histórico**: cards por aluno (nome, total de envios, última mensagem, se respondeu), expansível pra ver cada envio individual — envios do mesmo `grupo_envio_id` aparecem como 1 entrada na timeline, não N repetidas.
- **Horário estimado por slot**: 1 slot por aluno-grupo (não por parcela), consistente com "1 mensagem por aluno".
- Cores de severidade: vermelho (atrasado), âmbar (vence essa semana / poucos dias de atraso), azul (este mês, ainda não venceu) — mesma paleta já usada em `TIPO_COLORS`/badges hoje, só reorganizada por gravidade em vez de por tipo de template.

## 7. Fora de escopo

- Não mexe no `resumo-diario` (dormant feature).
- Não muda o mecanismo de instâncias Evolution / anti-ban / horários.
- Não adiciona canal de cobrança novo (e-mail, SMS) — continua só WhatsApp.
- Não migra dados históricos de `cobranca_logs` (os 3 pares duplicados antigos ficam como estão, é só histórico).
