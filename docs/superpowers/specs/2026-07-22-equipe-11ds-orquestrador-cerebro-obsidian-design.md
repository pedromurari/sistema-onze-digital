# Equipe 11DS: orquestrador, delegação e cérebro Obsidian

Data: 2026-07-22

## Objetivo

Transformar os agentes atuais em uma equipe operacional confiável: qualquer agente pode receber um objetivo, consultar contexto amplo, montar um plano, pedir uma única confirmação, delegar etapas a especialistas, executar ferramentas reais, validar a entrega e registrar aprendizados permanentes no Obsidian.

O projeto também corrige a indisponibilidade atual das funções centrais `equipe-11ds-executar` e `equipe-11ds-calendario-executar`, que retornam `503 BOOT_ERROR` antes de processar requisições.

## Princípios

1. Um agente assume a responsabilidade pela entrega completa.
2. Especialistas mantêm cargos, limites e critérios de qualidade próprios.
3. Delegação ocorre por etapas explícitas de um plano confirmado.
4. Uma confirmação autoriza somente o plano apresentado.
5. Nenhum agente declara sucesso sem evidência verificável.
6. Leitura de contexto é ampla, respeitando as permissões do usuário.
7. Alterações são limitadas ao plano confirmado.
8. Memória permanente é curada; histórico bruto permanece auditável no Supabase.

## Arquitetura

### Orquestrador 11DS

O Orquestrador é a porta de entrada comum para os chats. Ele:

- interpreta o objetivo em linguagem natural;
- consulta dados autorizados no Supabase;
- recupera memórias relevantes do Obsidian;
- escolhe agentes e ferramentas;
- produz um plano estruturado;
- persiste plano, etapas e dependências;
- aguarda uma única confirmação;
- coordena execução, delegação, QA e relatório final.

O agente que recebeu a solicitação permanece como responsável visível. O Orquestrador atua como infraestrutura e não substitui a personalidade ou especialidade do agente.

### Plano de execução

Um plano contém:

- objetivo e resultado esperado;
- resumo executivo para confirmação;
- etapas ordenadas;
- agente responsável por etapa;
- ferramenta e parâmetros validados;
- dependências;
- dados que serão criados ou alterados;
- efeitos externos previstos;
- critérios de sucesso;
- política limitada de correção;
- estimativa de custo e duração quando relevante.

Estados do plano e das etapas: `planejada`, `aguardando_confirmacao`, `executando`, `aguardando`, `corrigindo`, `concluida`, `erro` e `cancelada`.

### Execução

Depois da confirmação, o executor inicia apenas etapas cujas dependências foram concluídas. Etapas independentes podem rodar em paralelo; etapas que usam o mesmo agente ou recurso sensível são serializadas.

Falhas recuperáveis recebem no máximo uma correção automática orientada pelo erro. Mudanças de escopo, novos efeitos externos, exclusões ou operações sensíveis exigem um novo plano e uma nova confirmação. Não haverá repetição ilimitada.

## Agentes e delegação

Cada agente terá um contrato versionado com:

- cargo, responsabilidade e especialidade;
- entradas que consegue interpretar;
- ferramentas permitidas;
- critérios de qualidade;
- ações proibidas;
- dados que pode consultar;
- agentes para os quais pode delegar;
- formato de entrega e evidências exigidas.

O responsável pode delegar a qualquer especialista necessário, desde que a etapa esteja no plano confirmado. Exemplos:

- Gestor delega pesquisa ao Estrategista, texto ao Redator, direção ao Diretor de Arte, produção à Nina e validação ao QA.
- Financeiro delega uma comunicação preparada à Bia, mas não envia sem o efeito estar previsto no plano.
- Bia consulta CRM e campanhas, prepara segmentação e mensagem, e registra resultados reais do disparo.
- Curador avalia aprendizados ao final de execuções relevantes.

## Catálogo de ferramentas

O servidor mantém um catálogo fechado de ferramentas. O modelo pode propor chamadas, mas não inventar ferramentas ou executar código livre.

Cada ferramenta declara:

- identificador e versão;
- agentes autorizados;
- esquema de entrada e saída;
- validações e permissões;
- classificação de risco;
- se produz efeito externo;
- idempotência e chave de deduplicação;
- timeout e política de correção;
- evidência de sucesso.

Ferramentas iniciais cobrem calendário editorial, geração de post, pesquisa e redação, direção de arte, consulta ao CRM, produtos, financeiro, campanhas, disparos, leitura e curadoria do Obsidian e tarefas genéricas compatíveis com os cargos.

## Cérebro coletivo no Obsidian

O repositório `11ds-conhecimento`, acessado pelas credenciais guardadas no Supabase Vault, será a fonte de conhecimento permanente da equipe.

Estrutura inicial:

```text
11ds-conhecimento/
├── Empresa/
├── Clientes/
├── Agentes/
├── Procedimentos/
├── Campanhas/
├── Identidade-Visual/
├── Aprendizados/
└── Decisoes/
```

As notas usam Markdown com metadados: tipo, escopo, cliente, fonte, data, confiança, agentes relacionados e última validação.

Antes de planejar, o Orquestrador recupera apenas notas pertinentes ao objetivo. O contexto é limitado, priorizado e rastreável. O Curador transforma resultados e feedback em propostas de memória, resolve duplicações e evita contradições. Conversas completas, payloads, erros e logs permanecem no Supabase, não no Obsidian.

Memórias podem ser corrigidas, invalidadas ou removidas de forma auditável.

## Persistência no Supabase

Além das mensagens e ações já existentes, serão persistidos:

- planos;
- etapas e dependências;
- delegações;
- chamadas de ferramenta;
- evidências;
- tentativas de correção;
- consumo e duração;
- propostas e gravações de memória;
- eventos de auditoria.

RLS restringe cada usuário aos dados permitidos. Escritas privilegiadas acontecem em Edge Functions autenticadas e validadas no servidor.

## Confirmação e segurança

O painel apresenta um cartão de plano com objetivo, etapas, responsáveis, alterações e efeitos externos. O usuário pode confirmar ou cancelar o plano inteiro.

A confirmação registra usuário, horário, versão do plano e hash do conteúdo aprovado. Qualquer alteração material invalida a autorização anterior.

Tokens, segredos, credenciais e conteúdo interno do Vault nunca são enviados ao modelo ou exibidos no painel. Ferramentas aplicam autorização no servidor, mesmo quando o plano foi confirmado.

## QA e evidência

Toda etapa define evidência verificável, como:

- registros criados ou atualizados;
- arquivo ou post gerado;
- contagem e identificadores de itens processados;
- resposta autenticada de uma integração;
- resultado de consulta posterior à escrita;
- validação visual ou textual;
- relatório financeiro calculado a partir de dados reais.

O QA compara resultado, objetivo, regras do cargo e memória pertinente. Uma entrega só vira `concluida` quando os critérios forem satisfeitos. Ressalvas permanecem explícitas no relatório final.

## Saúde e observabilidade

O sistema terá diagnóstico central de saúde para Edge Functions, banco, OpenAI, GitHub/Obsidian e integrações essenciais. O painel mostrará indisponibilidade por ferramenta e agente, com mensagem útil em vez de `Failed to send a request`.

Cada fronteira assíncrona registra início, conclusão, duração, erro normalizado, agente, plano e etapa. Logs não contêm segredos nem payloads sensíveis.

O primeiro marco republica e testa `equipe-11ds-executar` e `equipe-11ds-calendario-executar`, hoje em `BOOT_ERROR`, antes de habilitar o novo Orquestrador.

## Testes e aceite

### Testes automatizados e seguros

- boot e CORS de todas as Edge Functions da equipe;
- autenticação, RLS e autorização das ferramentas;
- criação, confirmação, cancelamento e alteração de plano;
- dependências e delegação entre agentes;
- deduplicação e limites de correção;
- leitura seletiva do Obsidian;
- proposta, gravação e invalidação de memória;
- tratamento de timeout e indisponibilidade;
- QA e evidências obrigatórias.

### Fluxos ponta a ponta

- Gestor cria calendário e confirma registros no banco;
- Nina gera o próximo post com delegação completa do time criativo;
- Redator recebe objetivo, consulta memória e entrega texto revisado;
- Financeiro prepara análise sem movimentar dinheiro;
- Comunicação prepara campanha sem disparar durante o teste;
- agente genérico delega uma missão multietapas e entrega relatório final;
- painel publicado exibe plano, progresso, erros e evidências.

### Critério de conclusão

O trabalho está concluído quando todas as funções iniciam, os fluxos críticos passam em produção com operações de teste seguras, nenhum agente executa fora do plano confirmado, a delegação é rastreável e o Obsidian influencia comprovadamente planejamento e entrega.

## Implantação

1. Corrigir e republicar os bundles com `BOOT_ERROR`.
2. Criar tabelas e contratos do Orquestrador.
3. Implementar catálogo de ferramentas e executor de planos.
4. Integrar leitura e curadoria do Obsidian para todos os times.
5. Adaptar o chat e o painel de progresso.
6. Migrar gradualmente os agentes e manter compatibilidade temporária.
7. Executar testes seguros em produção e ativar o diagnóstico de saúde.

