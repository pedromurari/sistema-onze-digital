# Blueprint visual, Curador confiável e conversa limpa

## Status

Design aprovado pelo usuário em 22 de julho de 2026.

## Objetivo

Corrigir três problemas conectados da Equipe 11DS:

1. posts tipográficos que preservam apenas cores gerais, mas perdem a composição, a escala, a riqueza e a hierarquia da referência aprovada;
2. um Curador que aplica uma régua restritiva também às orientações explícitas do usuário e, por isso, deixa de construir memória útil;
3. um painel que mistura ficha de cargo, conversa, plano, decisões, tarefas e controles técnicos no mesmo nível visual.

O resultado deve se comportar como uma equipe profissional: o usuário conversa naturalmente, revisa uma ação simples, confirma uma vez e recebe uma entrega visualmente consistente. A complexidade permanece auditável, mas recolhida.

## Diagnóstico atual

### Produção visual

O backend possui uma descrição textual de direção de arte, mas o compositor recebe um perfil genérico e não um contrato geométrico versionado. A referência é tratada como inspiração, não como blueprint. Isso permite que cartão, identidade, título e CTA mudem de escala ou posição entre execuções.

A peça entregue também não cumpre a exigência de feed quadrado: o arquivo de exemplo mede 366 × 472. A referência mede 2184 × 2880 e deve servir apenas como blueprint compositivo a ser adaptado para 1:1, nunca como justificativa para manter o formato vertical.

### Curadoria

Há duas decisões de curadoria no fluxo: a curadoria diária do executor e a curadoria do orquestrador. Ambas instruem o modelo a preferir não gravar. Essa regra é apropriada para inferências automáticas, mas incorreta para uma preferência ou decisão declarada diretamente pelo usuário.

O fluxo atual também cria notas independentes para aprendizados do orquestrador e não diferencia claramente memória ativa, substituída, arquivada ou aguardando sincronização.

### Interface

O painel atual apresenta muitos conceitos internos: ficha de cargo, conversa, plano, etapas, evidências, últimas decisões, recorrências, grupos de tarefas, seletor “Avulso” e compositor. O usuário precisa interpretar a arquitetura antes de conseguir pedir algo.

## Decisões aprovadas

- Referências aprovadas funcionam como blueprint obrigatório.
- O blueprint é adaptado para feed 1:1.
- Mudam apenas headline, tema e elementos previamente autorizados.
- Toda orientação explícita do usuário vira memória permanente sem veto do GPT.
- Inferências dos agentes continuam sujeitas a curadoria rigorosa.
- A interface segue a alternativa A, “Conversa limpa”.
- O sistema mantém uma única confirmação antes dos efeitos externos.

## 1. Contrato visual do post

### 1.1 Blueprint versionado

Cada cliente pode ter um `visual_blueprint` ativo e versionado. O Instituto Despertamente terá como primeira versão o blueprint derivado da `Frame 1`.

O blueprint não é um prompt livre. Ele define parâmetros estruturais que o compositor precisa aplicar:

- proporção e tamanho do canvas;
- caixa segura e margens;
- posição e dimensões relativas do cartão;
- raio, borda, brilho e sombra do cartão;
- posição e escala do logo;
- posição, tamanho e relação entre nome e handle;
- linha decorativa entre identidade e headline;
- largura máxima, escala, entrelinha e número máximo de linhas da headline;
- regra de destaque semântico em dourado;
- posição, escala e tratamento do CTA;
- ornamentos obrigatórios e suas zonas permitidas;
- intensidade máxima de brilho, ruído e textura.

O compositor registra a versão do blueprint usada em cada post. Uma versão nova substitui a anterior para novas peças, sem alterar o histórico.

### 1.2 Saída e resolução

- O feed é sempre quadrado.
- A entrega principal é renderizada em 4096 × 4096.
- Textos, bordas e ornamentos são compostos na resolução final para permanecerem nítidos.
- Fundos raster menores podem ser ampliados com tratamento de textura, mas nunca podem reduzir a nitidez da tipografia.
- Derivados para stories são opcionais e não alteram o contrato do feed 1:1.

### 1.3 Formato tipográfico

O formato tipográfico preserva a mesma assinatura em todas as peças:

- fundo preto profundo com riqueza visual distribuída;
- grafismos temáticos de baixa opacidade;
- luz âmbar controlada;
- elementos orgânicos e ondas douradas nas bordas, conforme blueprint;
- cartão dominante e proporcional à referência;
- identidade do perfil com presença visual real;
- headline grande, editorial e legível;
- palavra ou expressão-chave em dourado;
- CTA discreto, porém legível.

O tema muda o conteúdo e pode selecionar uma família autorizada de ornamentos. Ele não altera a hierarquia do template.

### 1.4 Formato fotográfico

A alternância determinística continua entre tipográfico e fotográfico. O formato fotográfico usa:

- fotografia cinematográfica relacionada ao tema;
- composição de ação, tensão ou metáfora concreta;
- tratamento âmbar e preto da marca;
- overlay, headline, logo e CTA derivados do mesmo sistema visual;
- proibição de poses e cenas genéricas já definidas pela equipe.

O blueprint fotográfico compartilha identidade e QA com o tipográfico, mas possui zonas específicas para pessoa, cena e área de texto.

### 1.5 QA visual bloqueante

Antes de entregar uma peça, o Gestor valida automaticamente:

- canvas exatamente 1:1;
- resolução mínima da entrega;
- presença e versão do blueprint;
- margens e zonas seguras;
- escala mínima do cartão, logo, perfil, headline e CTA;
- limite de linhas e ausência de texto cortado;
- contraste mínimo;
- presença dos ornamentos obrigatórios;
- identidade cromática;
- ausência de artefatos, texto duplicado ou elementos não autorizados.

Falhas determinísticas provocam recomposição automática. A peça só recebe estado `pronta` após passar no QA. Depois de um número limitado de tentativas, o fluxo para com motivo explícito e preserva as evidências.

## 2. Memória do Curador

### 2.1 Duas origens, duas políticas

#### Diretiva explícita do usuário

Referências, correções, preferências, aprovações e proibições declaradas pelo usuário são memórias determinísticas. O GPT pode estruturar o texto, mas não decide se ele será salvo.

Exemplos:

- “Sempre 1:1.”
- “Use a Frame 1 como blueprint.”
- “Não diminua a headline.”
- “Alterne tipográfico e fotográfico.”

#### Inferência automática

Observações produzidas pelos agentes precisam continuar atendendo simultaneamente aos critérios de ser não óbvias, concretas/acionáveis e capazes de mudar uma decisão futura. Inferências descartadas ficam somente na auditoria técnica e não aparecem repetidamente na conversa.

### 2.2 Modelo de memória

Cada memória possui:

- origem `usuario` ou `agente`;
- tipo e escopo;
- cliente opcional;
- regra acionável;
- resumo curto;
- evidência ou referência de origem;
- agentes consumidores;
- prioridade;
- estado `ativa`, `substituida`, `arquivada` ou `pendente_sincronizacao`;
- versão e relação com a memória substituída;
- autor e timestamps;
- caminho no Obsidian e hash do conteúdo.

O Supabase funciona como índice operacional e fila de sincronização. O Obsidian/GitHub continua como cérebro humano, consolidado e versionado.

### 2.3 Notas consolidadas

Em vez de criar um arquivo isolado por plano, memórias do cliente são consolidadas por domínio. Para o Instituto, a identidade visual vive em uma nota estável, por exemplo:

`Clientes/instituto-despertamente/identidade-visual.md`

A nota registra o blueprint ativo, histórico de versões, regras permanentes e links para referências aprovadas. Procedimentos gerais continuam em notas próprias da equipe.

### 2.4 Sincronização confiável

- A memória é registrada primeiro no Supabase com estado pendente.
- Um worker tenta gravar ou atualizar a nota do Obsidian.
- Sucesso marca a memória como ativa e guarda SHA/caminho.
- Falhas recebem retry com backoff e erro auditável.
- A interface mostra `Aguardando sincronização` até o GitHub confirmar.
- O sistema nunca responde “salvo” antes de haver registro local persistente.

### 2.5 Consumo pelos agentes

O orquestrador recupera apenas memórias ativas e relevantes. O blueprint ativo é obrigatório para Diretor de Arte, Nina e Gestor. Regras de copy são entregues ao Redator. Memórias substituídas e arquivadas não entram no contexto normal.

## 3. Interface “Conversa limpa”

### 3.1 Estrutura principal

O painel do agente possui três áreas:

1. cabeçalho compacto com nome, função, estado e contagem de memórias relevantes;
2. conversa contínua ocupando o espaço principal;
3. compositor fixo com uma única pergunta: “O que você quer que este agente faça?”.

Ficha de cargo, últimas decisões, recorrências, tarefas por estado e evidências técnicas deixam de competir com a conversa.

### 3.2 Compositor

- Remove o termo “Avulso”.
- Mantém um único campo de linguagem natural.
- Oferece anexo de referência.
- Mostra cliente apenas quando necessário ou em `Opções`.
- Move recorrência para `Opções` com texto humano.
- Oferece sugestões contextuais como “Gerar próximo post” e “Ensinar uma referência”.

### 3.3 Plano e confirmação

Quando uma ação exige efeito externo, a conversa mostra um cartão simples:

- o que será feito;
- cliente afetado;
- mudanças externas previstas;
- memórias que serão criadas ou atualizadas;
- botões `Cancelar` e `Confirmar`.

A confirmação libera o plano inteiro. A lista técnica de ferramentas e slugs fica recolhida em `Ver detalhes`.

### 3.4 Progresso e resultado

Depois da confirmação, o mesmo cartão muda de estado:

- “Diretor definindo conceito”;
- “Nina compondo”;
- “Gestor validando”;
- “Curador sincronizando memória”.

O resultado mostra imagem grande, legenda e ações principais: `Abrir em Posts`, `Baixar` e `Pedir correção`. Evidências, duração, IDs e mensagens internas ficam em detalhes expansíveis.

### 3.5 Experiência do Curador

Memórias salvas aparecem inline como confirmações legíveis. O usuário pode abrir a lista de memórias ativas, ver origem e escopo e substituir ou arquivar uma regra. Mensagens repetidas de descarte não aparecem na linha principal.

### 3.6 Responsividade e acessibilidade

- O painel continua utilizável em celular e desktop.
- A conversa usa largura confortável e ordem cronológica.
- Ações principais permanecem acessíveis por teclado.
- Estados não dependem somente de cor.
- Controles têm rótulos explícitos.
- O compositor não cobre o resultado em telas pequenas.

## 4. Arquitetura e fluxo

1. O usuário envia texto e, opcionalmente, referência e cliente.
2. O orquestrador classifica intenção e recupera memórias ativas.
3. Diretivas explícitas são transformadas em registros de memória pendentes.
4. O orquestrador monta o plano em linguagem simples.
5. O usuário confirma uma vez.
6. Agentes executam suas etapas com memória e blueprint aplicáveis.
7. O compositor renderiza a versão correta do blueprint.
8. O Gestor executa QA bloqueante.
9. O Curador sincroniza as memórias pendentes no Obsidian.
10. A interface apresenta o resultado e mantém a auditoria recolhida.

## 5. Erros e idempotência

- Cada confirmação possui chave idempotente.
- O mesmo plano não pode gerar duas peças ou duas memórias equivalentes.
- Memórias explícitas duplicadas atualizam ou confirmam a regra existente.
- Erro de composição não publica uma peça incompleta.
- Erro de sincronização não perde a memória persistida no Supabase.
- Falhas mostram ação possível: tentar novamente, pedir correção ou abrir detalhes.
- Nenhuma etapa de publicação externa ocorre sem a confirmação aprovada.

## 6. Dados e componentes previstos

### Backend

- versão e parâmetros do blueprint visual;
- referência aprovada armazenada em local persistente;
- memória com origem, estado, consumidores e relação de substituição;
- fila de sincronização com tentativas e próximo retry;
- resultado estruturado do QA visual;
- vínculo do post com a versão do blueprint.

### Frontend

- `AgentConversationHeader`;
- `AgentConversationTimeline`;
- `ActionPlanCard`;
- `ExecutionProgressCard`;
- `MemorySavedCard`;
- `PostResultCard`;
- `AgentComposer`;
- `TechnicalDetailsDisclosure`.

Os nomes são fronteiras de responsabilidade, não exigem necessariamente um arquivo para cada componente. A implementação deve evitar que o painel volte a concentrar toda a lógica em um único bloco difícil de testar.

## 7. Testes e validação

### Automatizados

- blueprint tipográfico produz canvas quadrado e parâmetros esperados;
- QA rejeita proporção, resolução, escala, contraste e texto cortado;
- diretiva explícita cria memória independentemente da avaliação do GPT;
- inferência automática ainda respeita os três critérios;
- memória duplicada não cria arquivos conflitantes;
- falha no GitHub entra em retry;
- memória substituída deixa de ser recuperada;
- interface mostra confirmação única e esconde detalhes por padrão;
- estados de execução e erro são apresentados corretamente.

### Produção

1. registrar a `Frame 1` como blueprint ativo do Instituto;
2. confirmar a memória no Supabase e no Obsidian;
3. gerar um post tipográfico de teste;
4. validar 4096 × 4096, composição, hierarquia e identidade;
5. gerar o próximo post fotográfico para validar alternância;
6. testar pedido, confirmação, progresso, correção e resultado na interface publicada.

## 8. Critérios de conclusão

O trabalho só está concluído quando:

- o post tipográfico mantém a estrutura aprovada da referência em 1:1;
- o arquivo final é 4096 × 4096;
- o QA impede entrega abaixo do padrão;
- uma orientação explícita aparece como memória persistida e sincronizada;
- Diretor, Nina e Gestor recuperam o blueprint ativo;
- a tela principal segue a conversa limpa aprovada;
- termos e históricos técnicos ficam recolhidos;
- o fluxo completo passa em produção sem duplicação e com mensagens de erro acionáveis.
