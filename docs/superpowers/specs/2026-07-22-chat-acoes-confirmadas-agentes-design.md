# Chat acionável para todos os agentes da Equipe 11DS

## Objetivo

Permitir que qualquer agente da Equipe 11DS entenda pedidos em linguagem natural, responda de forma contextual e proponha ações reais do sistema. Nenhuma ação com efeito externo ou alteração de dados é executada sem confirmação explícita do usuário.

Esta entrega também corrige a indisponibilidade da Edge Function `equipe-11ds-diario`, que responde `503 BOOT_ERROR` antes de processar requisições.

## Arquitetura

### Roteador de intenção

- Uma Edge Function de chat recebe o agente, a mensagem do usuário e o contexto essencial da conversa.
- O GPT retorna uma resposta conversacional e uma proposta estruturada de ação quando houver intenção executável.
- A proposta contém: ação, escopo, resumo para confirmação, riscos/efeitos e payload validado.
- O servidor, e não o modelo, valida se a ação faz parte do catálogo permitido para o agente.

### Catálogo de ações

- Todos os agentes podem receber uma ordem em linguagem natural e executar a tarefa pelo respectivo `executor_function` após confirmação.
- Nina e Gestor de Mídia podem propor `gerar_proximo_post` e `gerar_calendario`.
- Demais agentes expõem apenas funções que já existem no sistema e que estejam explicitamente cadastradas no catálogo.
- Pedidos não suportados resultam em resposta útil sem afirmar que uma ação foi executada.

## Fluxo de confirmação

1. O usuário envia uma mensagem ao agente.
2. O GPT interpreta a intenção e, se houver ação, a interface exibe o resumo e os botões `Confirmar` e `Cancelar`.
3. `Cancelar` encerra a proposta sem efeitos no sistema.
4. `Confirmar` chama a Edge Function executora com o payload validado.
5. O chat exibe resultado, erro ou links retornados pela ação.

O modelo nunca chama funções diretamente, não escolhe destinos externos e não pode executar uma ação por texto implícito. Confirmação explícita é obrigatória para toda mutação, envio, publicação, disparo, cobrança ou geração de conteúdo.

## Dados e histórico

- Propostas de ação, confirmações, cancelamentos e resultados são persistidos no histórico da conversa do agente.
- Cada registro referencia o agente, a intenção normalizada, a ação proposta, o payload sanitizado e o estado (`proposta`, `confirmada`, `cancelada`, `concluida` ou `erro`).
- O histórico atual de decisões continua separado e pode ser usado como contexto resumido para o chat.

## Correção da rotina de posts

- A função `equipe-11ds-diario` será republicada a partir do código validado no repositório.
- Antes de habilitar o uso pelo botão ou pelo chat, a função precisa responder com sucesso ao preflight CORS e a uma invocação autenticada de teste que não gere conteúdo real.
- Se o endpoint retornar `BOOT_ERROR`, a interface não deve comunicar uma falha genérica; deve mostrar que a rotina está indisponível e não criar uma proposta concluída.

## Erros e validação

- Ações falhas não geram confirmação de sucesso e mantêm o histórico no estado `erro`, com mensagem recuperável.
- O usuário pode solicitar uma nova tentativa, que cria nova proposta e exige confirmação novamente.
- Validação inclui build, fluxo completo da Nina (`gere o próximo post` -> confirmação -> execução), cancelamento, execução de tarefa para outro agente e falha de função.

## Fora de escopo

- Autonomia sem confirmação.
- Adição de ações externas que ainda não existam no sistema.
- Mudanças nas regras editoriais, no padrão visual premium ou na alternância de formatos já publicados.
