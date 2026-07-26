# Financeiro: WhatsApp dedicado, escopo por turma e anti-ban de verdade (Cobrança + Boas-vindas)

**Data:** 2026-07-26
**Status:** aprovado para virar plano de implementação

## Contexto e motivação

O usuário vai conectar um número de WhatsApp dedicado só para o financeiro, para que a
automação de cobrança cuide de todos os leads/alunos das turmas que ele escolher
manualmente (não existe uma regra fixa de "quem é da Onze Digital" — é decisão por turma,
turma a turma). As mensagens são de dois tipos que já existem como templates
(`pre_vencimento`/`vencimento`, `pos_vencimento`): lembrete de vencimento e aviso de boleto
vencido. Requisito não-negociável: sempre com anti-ban.

Durante o levantamento, descobrimos três coisas que mudam o escopo:

1. A Cobrança hoje roda para o sistema inteiro (todos os alunos, sem filtro de turma) e o
   anti-ban real é só um delay fixo de 800ms num loop que processa a fila inteira de uma vez
   por dia — a "janela de horário" mostrada na tela é cosmética, o envio de verdade ignora
   ela.
2. O seletor de instância que já existe na tela (`EvolutionTaskPanel`, hoje só na aba
   Cobrança) grava em `evolution_task_config`, mas **nenhuma função de envio lê essa
   tabela** — nem `enviar-cobranca`, nem `funil-processar`. É um bug de conexão
   pré-existente: escolher o número ali hoje não muda nada de verdade.
3. O sistema de Boas-vindas da Semana do Despertar já não é automático-instantâneo — o
   usuário clica um botão no Kanban de Lançamento que enfileira os pendentes em
   `boas_vindas_agendados`, processado aos poucos pelo cron `funil-processar`. Mas o
   anti-ban de lá é fraco (máx. 20 por ciclo, 3–5s fixo, sem horário seguro, sem limite
   diário, sem pausa por erro sequencial) e não há como escolher o número.

O padrão de anti-ban forte já existe e está provado em produção: `disparo_campanhas` /
`disparo-runner` (delay aleatório configurável, limite diário, horário seguro, rodízio de
instância com checagem de conexão real, pausa automática em erro sequencial). Este design
estende esse mesmo padrão para Cobrança e Boas-vindas, e corrige a conexão do seletor de
instância.

**Fora de escopo** (confirmado com o usuário): o gatilho automático de boas-vindas do IDM
Pelo Brasil / eventos NPA (`npa-bv-trigger`) não muda — continua enviando na hora. O botão
"Agendar boas-vindas pendentes" do Kanban de Lançamento também não muda — o fluxo manual de
enfileirar já está bom, só o processamento da fila é que ganha anti-ban forte + escolha de
número. A tabela `evolution_task_config` para a task `'funil'` (mensagens de
`funnel_messages`) também está com a mesma desconexão, mas corrigir isso não foi pedido —
fica registrado como débito técnico conhecido, não faz parte deste trabalho.

## Arquitetura geral

Três frentes, todas reaproveitando o mesmo vocabulário de colunas de anti-ban que
`disparo_campanhas` já usa (`delay_min_s`, `delay_max_s`, `daily_limit`, `safe_hour_start`,
`safe_hour_end`, `max_errors_seq` + estado `enviados_hoje`/`erros_seq`/`pausado_por_erro`):

1. **Cobrança** — escopo por turma (allow-list manual) + fila com tique substituindo o
   disparo único diário em rajada.
2. **Boas-vindas (Semana do Despertar)** — mesmo nível de anti-ban aplicado ao
   processamento de `boas_vindas_agendados`, por funil.
3. **Correção de conexão** — `evolution_task_config` passa a ser lido de verdade pelas duas
   funções acima (tasks `'cobranca'` e `'boas_vindas'`), com fallback para "todas as
   instâncias ativas por prioridade global" quando não há seleção — mesmo comportamento que
   a tela já promete.

## 1. Cobrança — escopo por turma

**Dado novo:** tabela `cobranca_turmas_ativas (turma_id uuid PK references turmas(id) on
delete cascade, ativado_em timestamptz default now())` — lista simples de opt-in. Turma
que não está nessa tabela nunca entra na fila de cobrança, não importa o status do
pagamento.

`alunos.cobranca_ativa` (toggle por aluno que já existe) continua funcionando como exceção
fina dentro de uma turma ativa — os dois filtros são `AND`, não substituem um ao outro.

`get_alunos_para_cobranca(p_data date)` ganha um `JOIN cobranca_turmas_ativas cta ON
cta.turma_id = a.turma_id` (inner join — sem entrada na tabela, sem fila).

**UI:** nova seção na aba **Configuração** da Cobrança, abaixo das regras de envio: lista
de turmas com checkbox (mesmo estilo visual do `DaysChips` que já existe no arquivo),
carregada de `turmas` e comparada contra `cobranca_turmas_ativas`. Toggle liga/desliga uma
linha na tabela.

## 2. Cobrança — fila com tique (anti-ban real)

`cobranca_config` ganha colunas novas:

| coluna | tipo | default | uso |
|---|---|---|---|
| `delay_min_s` | int | 20 | menor delay entre envios |
| `delay_max_s` | int | 60 | maior delay entre envios |
| `daily_limit` | int | 150 | teto de envios/dia |
| `max_errors_seq` | int | 3 | erros seguidos até pausar sozinho |
| `evolution_config_ids` | text[] | `{}` | rodízio de instâncias (vazio = usa `evolution_task_config` da task `'cobranca'`) |
| `enviados_hoje` | int | 0 | contador do dia corrente |
| `dia_contagem` | date | hoje | data a que `enviados_hoje` se refere — muda de dia, zera o contador antes de checar o limite |
| `erros_seq` | int | 0 | contador de erros consecutivos |
| `ultimo_envio_em` | timestamptz | null | usado para não disparar antes do delay aleatório passar |
| `pausado_por_erro` | boolean | false | true = circuito aberto, precisa reativar manualmente |

`enviar-cobranca` ganha um modo novo `{ tick: true }`:

1. Se `!cobrancaCfg.ativo || cobrancaCfg.pausado_por_erro` → não faz nada.
2. Se fora do horário seguro (`horario_inicio_envio`/`horario_fim_envio`, fuso
   `America/Sao_Paulo`) ou fim de semana com `pausar_fins_semana=true` → não faz nada.
3. Se `enviados_hoje >= daily_limit` → não faz nada (o contador zera sozinho quando a data
   muda, verificada a cada tique).
4. Se `ultimo_envio_em` + delay aleatório (sorteado entre `delay_min_s` e `delay_max_s` no
   momento do envio anterior, guardado implicitamente pela comparação de tempo) ainda não
   passou → não faz nada.
5. Busca a fila fresca via `get_alunos_para_cobranca(hoje)` (a mesma função de sempre — ela
   já recalcula a cada chamada, então quem pagou no meio do dia some sozinho da fila).
6. Pega o **primeiro** item da fila que ainda não tem log `enviado`/`pendente` hoje.
7. Resolve a instância: `evolution_config_ids` da config (se preenchido) ou
   `evolution_task_config` da task `'cobranca'` (se preenchido) ou todas as ativas por
   prioridade — nessa ordem de prioridade. Antes de enviar, checa
   `/instance/connectionState/{instance}` da instância escolhida; se não estiver `"open"`,
   tenta a próxima da lista.
8. Envia, grava log, atualiza `enviados_hoje += 1`, `ultimo_envio_em = now()`,
   `erros_seq = 0` (sucesso) ou `erros_seq += 1` (erro). Se `erros_seq >= max_errors_seq`
   → `pausado_por_erro = true, ativo = false` e um log especial avisando que a automação se
   desligou sozinha.

O cron externo (cron-job.org) passa a chamar `{tick:true}` a cada poucos minutos (3–5 min,
o próprio usuário configura no cron-job.org) em vez de `{bulk:true}` uma vez por dia. O
`{bulk:true}` continua existindo só para o botão manual "Disparar agora" da tela — mas
também passa a respeitar checagem de conexão real e delay aleatório entre cada envio do
lote (não mais 800ms fixo), então mesmo o disparo manual fica mais seguro.

**UI (aba Configuração):** os novos campos (`delay_min_s`/`max_s`, `daily_limit`,
`max_errors_seq`) entram como inputs numéricos ao lado das regras de envio já existentes.
Quando `pausado_por_erro=true`, um banner vermelho aparece no topo da aba explicando que a
automação parou sozinha por erros seguidos, com botão "Reativar" que zera `erros_seq` e
`pausado_por_erro`.

## 3. Bia (Operações) ganha o domínio Financeiro

`equipe-11ds-comunicacao-executar` (executor da Bia) passa a também consultar
`cobranca_logs`/`cobranca_config`/a fila do dia (mesma `get_alunos_para_cobranca`), e o
`dados` do relatório ganha uma chave nova `cobranca: { enviadosHoje, errosHoje, filaAtual,
taxaErro }`, seguindo a mesma armadilha de formato já documentada (cada agente tem seu
próprio formato de `dados` — isso não muda o componente de renderização da Ana, é um bloco
à parte). O cálculo de "gargalo" (pior canal do dia, hoje comparando disparo/funil/grupos)
passa a considerar cobrança como mais um candidato, com a mesma regra de volume mínimo (5
tentativas) e margem de 2pp antes de chamar de "piorando".

**UI:** novo card no topo da aba Cobrança mostrando o texto mais recente da Bia sobre
cobrança (a última mensagem dela cujo domínio é cobrança, buscada em
`equipe_11ds_mensagens`), com botão "Pedir atualização da Bia agora" que dispara o executor
dela sob demanda — mesmo padrão do botão "Processar agora" que já existe no monitor de
Disparos.

## 4. WhatsApp dedicado do financeiro

Sem tabela nova além do que já existe: o usuário cadastra a instância nova em
**Configurações → WhatsApp** (isso já existe) e usa o `EvolutionTaskPanel` (já existe na
aba Cobrança) para atribuir essa instância — sozinha ou com backup em rodízio — à task
`'cobranca'`. A única mudança necessária aqui é a do item 6 (fazer `enviar-cobranca`
realmente ler essa escolha).

## 5. Boas-vindas (Semana do Despertar) — mesmo anti-ban, escolha de número

`boas_vindas_config` (por `funnel_name`) ganha as mesmas colunas do item 2:
`delay_min_s`/`delay_max_s` (troca o `3000 + Math.random()*2000` fixo), `daily_limit`
(troca o `limit(20)` fixo por ciclo), `safe_hour_start`/`safe_hour_end` (hoje não existe
nenhuma checagem de horário), `max_errors_seq` + estado (`enviados_hoje`, `dia_contagem`,
`erros_seq`, `pausado_por_erro`) — mesmo esquema do item 2.

O bloco de `funil-processar` que processa `boas_vindas_agendados` (linhas ~288-331 hoje)
passa a agrupar os pendentes por `funnel_name`, carregar a config daquele funil, e aplicar
por grupo: pular se fora do horário seguro, pular se `daily_limit` do dia já bateu, pular
se `pausado_por_erro`, resolver instância via `evolution_task_config` da task
`'boas_vindas'` (com o mesmo fallback do item 6), e o mesmo circuito de pausa automática
após `max_errors_seq` erros seguidos daquele funil. Itens que não puderem ser processados
no ciclo simplesmente continuam `pendente` — são pegos no próximo ciclo do cron, sem
precisar reagendar `agendado_para`.

A proteção existente contra erro ambíguo (timeout — nunca reenviar automaticamente às
cegas) continua exatamente como está, ela já é o comportamento correto e não depende do
mecanismo de anti-ban.

**UI:** nova instância de `EvolutionTaskPanel` (task `'boas_vindas'`, novo valor no union
type `EvolutionTask`) no painel de boas-vindas dentro do Kanban de Lançamento, junto dos
novos campos de anti-ban (delay/limite/horário), no mesmo lugar onde hoje já existe o
campo `delay_minutos`. O botão "Agendar boas-vindas pendentes" não muda de comportamento —
só o que acontece depois de enfileirado é que fica mais seguro.

## 6. Correção de conexão (débito pré-existente)

`evolution_task_config` passa a ser efetivamente consultado:

- `enviar-cobranca`, na resolução de instância do item 2, task `'cobranca'`.
- `funil-processar` (bloco de boas-vindas), task `'boas_vindas'` (novo valor).

Em ambos os casos, lista vazia ou ausência de linha = comportamento atual (todas as
instâncias ativas por `prioridade` global), preservando o que já funciona hoje para quem
não configurar nada.

`EvolutionTask` (tipo em `EvolutionTaskPanel.tsx`) ganha o valor `'boas_vindas'` no union.

## Tratamento de erro

- Erro ambíguo (timeout/rede) nunca é retentado automaticamente em outra instância nem
  conta como "erro normal" para o circuito de pausa — comportamento já existente em
  `funil-processar`, mantido igual e replicado no tique de `enviar-cobranca`.
- Erro claro (4xx/5xx com resposta) conta para `erros_seq`; ao atingir `max_errors_seq`, a
  automação daquele canal (cobrança ou boas-vindas daquele funil) se desliga sozinha e
  precisa de reativação manual na tela correspondente.
- Instância desconectada (`connectionState != "open"`) nunca é usada — tenta a próxima da
  lista de rodízio antes de desistir do ciclo.

## Testes / validação

Sem suíte automatizada no projeto (débito já conhecido). Validação via execução real:
ligar a automação de cobrança com 1-2 turmas de teste marcadas, confirmar que o resto do
sistema não aparece na fila; forçar um erro (ex: instância errada) e confirmar que a
automação pausa sozinha após `max_errors_seq`; confirmar visualmente que o card da Bia
atualiza depois de um ciclo de cobrança processado.

## Débito técnico conhecido (não resolvido neste trabalho)

- `evolution_task_config` para a task `'funil'` (mensagens de `funnel_messages`) continua
  desconectada — mesmo bug, escopo diferente, não pedido agora.
- Sem testes automatizados em nenhuma das três frentes.
