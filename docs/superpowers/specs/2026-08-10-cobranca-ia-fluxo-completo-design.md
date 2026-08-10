# Cobrança IA: conhecimento de negócio, promessa de pagamento e controle por aluno

## Contexto

O agente de IA de cobrança (`cobranca-ia-responder`) já está em produção há uma semana e já teve 21 conversas reais (todas em `aguardando_humano`, revisadas na aba "Conversas IA" de `Cobranca.tsx`). A primeira versão cobre só o essencial: reconhecer a mensagem, coletar uma data prometida de pagamento, ou fazer handoff. O usuário quer evoluir esse agente com regras de negócio reais e conectar o que ele aprende de volta na fila de cobrança automática, que hoje ignora completamente esse contexto.

Motivação:
- Os alunos são leads do grupo Cogna, com parceria com a Universidade Anhanguera — pagar pelo link da Voomp (não Pix) garante a extensão universitária no certificado. Hoje a IA não sabe disso e trataria essa dúvida como fora de escopo.
- Quando um aluno promete pagar numa data, a cobrança automática continua batendo nele todo santo dia, ignorando a promessa — isso é ruim pra experiência e pode até irritar quem já disse que vai pagar.
- Não existe hoje nenhum controle, no produto, de quais alunos entram na cobrança automática — a coluna que faz isso (`alunos.cobranca_ativa`) só é editável direto no banco.
- Pedido de cancelamento hoje cai no mesmo motivo genérico de qualquer outra dúvida fora de escopo, dificultando priorizar esses casos (mais sensíveis) na revisão humana.

Investigação confirmou que boa parte da infraestrutura já existe (ver `[[Arquitetura já existente]]` abaixo) — o trabalho é majoritariamente conectar peças já construídas, não criar do zero.

## Arquitetura já existente (não muda)

- `alunos.cobranca_ativa` (boolean, default `TRUE`) já existe e já é respeitado por `get_alunos_para_cobranca` — só falta UI.
- `pagamentos.data_prevista_pagamento` (date, nullable) já existe, já é exposta por `get_alunos_para_cobranca`, e já é editável manualmente na Fila via `PrevisaoPagamentoPopover` (`src/components/crm/finance/PrevisaoPagamentoPopover.tsx`) — só falta a IA gravar ali também, e a fila automática respeitar o valor.
- O gatilho da IA (`tentarAcionarIaCobranca` em `evo-resposta/index.ts`) já dispara pra qualquer resposta de um telefone com linha em `cobranca_logs` com `aluno_id` preenchido — e tanto o envio automático quanto o manual ("Ver mensagem/Enviar" na Fila) já gravam nessa tabela. Não precisa de nenhum passo manual novo tipo "marquei que mandei o boleto".
- "Cobrança por janelas" = o sistema de fases por faixa de dias de atraso que já existe (`cobranca_templates.dias_offset`/`dias_offset_fim`, resolvido em `resolveTemplateParaItem` dentro de `supabase/functions/enviar-cobranca/index.ts`) — continua rodando normalmente depois do primeiro contato, exceto no período pausado (ver mudança 4).
- O tique automático (`processarTick`, chamado via cron com `body.tick`) busca a fila com `db.rpc("get_alunos_para_cobranca")` e decide o que enviar via `proximoGrupoElegivel` → `resolveTemplateParaItem`, por aluno/pagamento.

## Mudanças

### 1. Conhecimento de negócio no prompt (`cobranca-ia-responder/index.ts`)

`buildSystemPrompt()` ganha um parágrafo novo: o pagamento é sempre pela Voomp, nunca por Pix, porque o aluno pertence ao grupo Cogna com parceria com a Universidade Anhanguera, e é pagando pelo link da Voomp que ele garante a extensão universitária no certificado. A IA pode usar isso pra responder dúvidas diretas sobre por que não pode pagar por Pix, sem precisar de handoff — mas continua proibida de negociar valor/prazo/desconto (guardrail existente, não muda).

A frase de fechamento usada em qualquer handoff (hoje genérica, tipo "vou encaminhar pro nosso time") passa a deixar explícito que o contato continua pelo mesmo número: algo como *"Vou repassar pro nosso time, tá bem? Alguém da nossa equipe fala com você por aqui mesmo."* — ajuste no prompt, o modelo já gera esse texto dinamicamente (`resposta`), só a instrução muda.

### 2. Motivo de handoff `pedido_cancelamento`

Hoje pedido de cancelamento cai em `fora_de_escopo`. Passa a ter motivo próprio:
- `MOTIVOS_VALIDOS` em `cobranca-ia-responder/index.ts` ganha `"pedido_cancelamento"`.
- Nova migration altera o `CHECK` de `cobranca_ia_conversas.motivo_handoff` pra incluir o novo valor.
- Prompt ganha uma regra explícita: pedido de cancelamento/desistência → `handoff=true`, `motivo_handoff='pedido_cancelamento'` (hoje só existe a regra geral "não pode prometer nem negar cancelamento", que continua valendo — só passa a ter handoff dedicado em vez de cair em fora de escopo).
- `resumoDeterministico()` ganha uma entrada pra esse motivo (hoje só tem texto pros motivos existentes).

### 3. IA grava a data prometida em `pagamentos.data_prevista_pagamento`

No passo em que `cobranca-ia-responder` já atualiza `cobranca_ia_conversas` com `data_prometida`/`status='dado_coletado'`, adiciona um `UPDATE pagamentos SET data_prevista_pagamento = <data> WHERE id = <pagamento_id ?? principal.id>`. Sem isso a fila nunca saberia da promessa — hoje esse campo só é preenchido quando um humano edita manualmente na Fila.

### 4. Fila automática pausa até a data prometida, cobra no dia

Em `resolveTemplateParaItem` (`enviar-cobranca/index.ts`), antes da lógica atual de fase por `dias_offset`:
- Se `item.data_prevista_pagamento` existe e é **posterior** a hoje → retorna `null` (parcela não elegível pro tique automático nessa rodada). A parcela continua visível normalmente na Fila (a RPC não muda, só o critério de elegibilidade do envio automático) — o time humano vê e pode agir manualmente a qualquer momento.
- Se `item.data_prevista_pagamento` é **igual** a hoje → resolve pro novo template `tipo='promessa_vencida'` (prioridade sobre a fase normal de dias de atraso), com uma mensagem tipo "Oi {{nome}}, hoje é o dia que você combinou de pagar a parcela {{parcela}}, o link continua o mesmo: {{link}}". Esse template é criado/editável na aba Templates como qualquer outro (migration cria a linha inicial, `ativo=true`, `dias_offset=0`, mas o campo que importa aqui é o `tipo`, resolvido por comparação de data, não de offset).
- Se a data prometida já passou sem pagamento → volta a cair na fase normal por `dias_offset` (contado do vencimento original, sem relação com a promessa) — nenhuma mudança de código aqui, é consequência natural de só pausar quando `data_prevista_pagamento > hoje`.

`calcularElegibilidade`/`proximoGrupoElegivel` não mudam — só o retorno de `resolveTemplateParaItem` muda, então o resto do fluxo de dedupe/agrupamento continua funcionando igual.

### 5. Toggle "cobrança automática" no card da Fila

`AlunoFilaCard` em `Cobranca.tsx` ganha um `Switch` pequeno ao lado do nome do aluno, ligado a `alunos.cobranca_ativa`. `onCheckedChange` faz `update` direto na tabela e atualiza o estado local (mesmo padrão de `onSalvarPrevisao`/`onMarcarCobrado` que já existem no componente). Quando desligado, o aluno some da Fila no próximo carregamento (já é o comportamento de `get_alunos_para_cobranca`, que filtra por `cobranca_ativa = TRUE`) — vale um toast explicando isso ao desligar, já que o card desaparece.

### 6. Toggle separado: quais alunos a IA pode responder

Independente de estar ou não na cobrança automática (mudança 5), o usuário quer controlar, aluno a aluno, se a IA tem permissão de assumir a conversa quando ele responder. É um controle novo, não reaproveita `cobranca_ativa` — um aluno pode estar fora da cobrança automática (time manda tudo na mão) e mesmo assim o usuário pode querer a IA ajudando nas respostas, ou o contrário.

- Nova coluna `alunos.cobranca_ia_ativa BOOLEAN NOT NULL DEFAULT TRUE` (default `TRUE` pra preservar o comportamento atual — hoje a IA já responde por qualquer aluno com log de cobrança, sem esse filtro).
- `tentarAcionarIaCobranca` em `evo-resposta/index.ts` passa a checar essa coluna pro `aluno_id` escolhido **antes** de chamar `cobranca-ia-responder` — se `false`, não aciona nada (nenhuma linha em `cobranca_ia_conversas` é criada, comportamento igual a hoje pra alunos sem log de cobrança: fica só o `respondeu_em` de sempre, 100% manual).
- Segundo `Switch` no mesmo `AlunoFilaCard`, ao lado do de cobrança automática, rotulado algo como "Resposta da IA" — mesmo padrão de update direto na tabela.

## Fora de escopo (explicitamente, pra não confundir depois)

- Não muda o `enviar-cobranca` pra também disparar automaticamente a *primeira* mensagem de cobrança — isso já é manual hoje (bem-vindo pelo time) e continua assim.
- Não cria nenhuma tela nova — os 6 itens acima entram nas telas/arquivos que já existem (`Cobranca.tsx`, `cobranca-ia-responder/index.ts`, `enviar-cobranca/index.ts`, `evo-resposta/index.ts`).
- Não mexe no cap de 8 turnos, no fail-closed de erro de IA, nem em nenhum dos guardrails duros já validados no agente (nunca negociar valor/desconto/prazo) — só adiciona conhecimento e um motivo de handoff novo.

## Verificação

1. **Prompt/conhecimento**: enviar (via `curl` direto na function, com aluno de teste real) uma pergunta tipo "posso pagar no Pix?" e confirmar que a IA responde com a explicação Cogna/Anhanguera sem fazer handoff.
2. **Cancelamento**: simular "quero cancelar minha matrícula" e confirmar `motivo_handoff='pedido_cancelamento'` gravado, e que a resposta de fechamento menciona que o time vai contatar pelo mesmo número.
3. **Data prometida → pagamentos**: simular uma resposta com data de pagamento, confirmar que `pagamentos.data_prevista_pagamento` foi atualizado pro `pagamento_id` certo (não só `cobranca_ia_conversas`).
4. **Pausa automática**: com uma parcela de teste com `data_prevista_pagamento` = amanhã, rodar `processarTick` manualmente (ou aguardar o tique) e confirmar que ela NÃO é escolhida por `proximoGrupoElegivel`.
5. **Cobrança no dia**: mesma parcela com `data_prevista_pagamento` = hoje, confirmar que dispara o template `promessa_vencida` em vez da fase normal.
6. **Pós-promessa**: mesma parcela com `data_prevista_pagamento` = ontem (sem pagamento), confirmar que volta a cair na fase normal por `dias_offset`.
7. **Toggle cobrança automática**: desligar `cobranca_ativa` de um aluno de teste na Fila, confirmar que ele some da lista após recarregar, e que `get_alunos_para_cobranca` de fato não retorna mais essa linha.
8. **Toggle resposta da IA**: com `cobranca_ia_ativa=false` num aluno de teste que tenha log de cobrança, simular uma resposta dele no WhatsApp e confirmar que nenhuma linha nova aparece em `cobranca_ia_conversas` (só o `respondeu_em` do log de cobrança de sempre). Ligar o toggle de volta e confirmar que a próxima resposta já aciona a IA normalmente.
