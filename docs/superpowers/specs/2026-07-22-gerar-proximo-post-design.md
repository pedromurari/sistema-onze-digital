# Gerar próximo post pelo Gestor de Mídia

## Objetivo

Trocar o controle global de `Rodar rotina diária` por uma ação editorial explícita: `Gerar próximo post`.

## Interface

- O controle fica disponível somente no painel do agente com `slug === 'gestor-midia'`.
- O botão usa o rótulo `Gerar próximo post` e mantém o estado de carregamento enquanto o disparo estiver em execução.
- O diálogo de confirmação explica que a ação inicia a próxima geração para os clientes ativos, respeitando a ordem editorial já configurada.
- Mensagens de sucesso e erro adotam a mesma linguagem e não mencionam rotina diária.

## Comportamento

- A ação continua chamando a Edge Function `equipe-11ds-diario` sem parâmetros extras.
- A função já aceita múltiplas gerações no mesmo dia e cria somente tarefas que não tenham outra geração ativa para o mesmo cliente.
- Cada post segue a alternância 1:1 entre os formatos tipográfico premium e fotográfico cinematográfico, definida no backend.
- Não serão adicionados seleção de cliente, novos endpoints ou novas mudanças de banco nesta alteração.

## Tratamento de erros e validação

- Falhas na invocação apresentam toast com a mensagem devolvida pelo Supabase.
- O botão fica desabilitado durante a execução para impedir duplo clique.
- Após o disparo, a lista de tarefas é recarregada.
- A verificação inclui build de produção e inspeção do diff para confirmar que o botão não aparece em painéis de outros agentes.
