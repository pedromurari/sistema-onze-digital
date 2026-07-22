# Identidade visual premium para posts

## Objetivo

Padronizar a produção de posts de Instagram do time 11DS para que cada cliente tenha um feed reconhecível, harmônico e premium. A identidade visual deve permanecer estável entre gerações, enquanto tema, texto e cena variam com intenção editorial.

O sistema produzirá dois formatos em alternância estrita 1:1:

1. `tipografico`: cartão editorial premium sobre fundo fixo da marca.
2. `fotografico`: fotografia editorial cinematográfica, contextual ao tema e composta com elementos reais da marca.

"4K" significa acabamento visual ultra-premium, e não exportação em resolução 4K. O formato de publicação permanece 4:5, adequado ao feed do Instagram.

## Direção de arte compartilhada

Uma direção de arte central será definida no pipeline de geração. Ela será uma regra de produção consumida por todos os papéis, e não uma sugestão independente em cada prompt.

### Assinatura de marca

- Paleta: preto profundo, âmbar/dourado e tons derivados das cores cadastradas do cliente.
- Linguagem: luxo sóbrio, contraste alto, textura sutil, luz controlada e acabamento editorial.
- Tipografia: aplicada pelo serviço de composição com fonte real; a API de imagem nunca deve gerar palavras, letras, logos ou CTAs.
- Logo, nome e `@handle`: sempre fornecidos pelos dados do cliente e colocados pelo compositor em posições definidas pelo formato.
- Headline: curta, legível e com hierarquia clara; palavras-chave recebem o destaque da cor primária.

### Formato tipográfico

- Usa somente fundos fixos e aprovados da marca.
- Cartão grande, dominante e centralizado; borda dourada sutil, cantos arredondados e contraste suficiente contra o fundo.
- Cabeçalho com logo, nome, selo quando existente e handle.
- Headline como elemento principal; CTA curto de leitura da legenda na base.
- Layout, proporção, margens, borda e hierarquia são fixos. Apenas a headline e o fundo aprovado variam.

### Formato fotográfico

- A API de imagem gera uma fotografia-base vertical 4:5, com aparência de campanha editorial de alto nível.
- A cena traduz o tema em um único momento ou metáfora visual concreta. Não deve ser uma ilustração de conceito ou uma lista de símbolos.
- Iluminação low-key, lateral ou de recorte; profundidade, sombras ricas, destaque âmbar/dourado e cenário real contextualizado.
- Há área negativa planejada para a headline, aplicada depois pelo compositor no rodapé. O logo fica discreto no topo.
- São proibidos: foto de banco genérica, pessoa parada em pose pensativa, mão no rosto, laptop com café, ambiente vazio, pele plástica, iluminação frontal de estúdio, infográficos, ícones, textos, marcas-d'água e letras na imagem-base.

## Responsabilidades dos agentes

| Agente | Responsabilidade visual |
| --- | --- |
| Gestor de mídia | Abre a produção no formato correto, valida o padrão visual e solicita uma única refação dirigida quando necessário. |
| Estrategista | Escolhe um tema que tenha potencial de virar cena ou metáfora visual específica e produzível. |
| Redator-chefe | Escreve headline com tamanho, ênfase e acentuação próprios para a hierarquia visual fixa. |
| Diretor de arte | Converte o tema em briefing fotográfico cinematográfico e impede estética genérica ou desconectada da marca. |
| Nina / produção | Chama a API de imagem, fornece o perfil ao compositor e garante logo, texto e CTA por composição determinística. |
| Curador | Registra aprendizados específicos por cliente sem alterar ou enfraquecer a direção de arte central aprovada. |

## Fluxo de geração e qualidade

1. O calendário calcula o formato pela sequência fixa `tipografico`, `fotografico`.
2. Estrategista, redator e diretor recebem a direção de arte central junto com o contexto do cliente.
3. Para post tipográfico, produção usa um fundo fixo e o compositor monta o cartão com os campos reais.
4. Para post fotográfico, o diretor cria um prompt de cena; a API `gpt-image-1.5` gera a imagem-base e o compositor aplica logo e headline.
5. O Gestor envia a imagem final para revisão visual estruturada. A avaliação exige: impacto de feed, contraste, legibilidade, fidelidade de paleta, acabamento editorial e relação entre cena e tema.
6. Quando a avaliação reprova, há no máximo uma nova geração com feedback objetivo. Caso ainda não passe, o post é salvo como rascunho com ressalva para revisão humana; a execução não falha silenciosamente nem entra em loop de custo.

## Alternância e reexecução

Hoje a cadência usa cinco posts tipográficos e dois fotográficos por semana. Ela será substituída, tanto no planejamento quanto na execução, por uma alternância determinística 1:1.

Hoje a rotina diária bloqueia clientes que já tenham post ou tarefa no mesmo dia, e `conteudo_posts` impõe unicidade por `(cliente_id, data_post)`. Ambas as travas impedem uma nova geração no mesmo dia.

O novo comportamento será:

- A rotina poderá ser disparada repetidas vezes no mesmo dia.
- Uma nova execução cria uma nova tarefa e uma nova geração em rascunho para cada cliente, sem apagar as anteriores.
- Apenas uma execução simultânea equivalente será bloqueada para evitar duplicidade de corrida; tarefas concluídas no mesmo dia não bloqueiam uma nova solicitação.
- A restrição única por cliente e data será removida, preservando o identificador de cada post como registro individual.
- O calendário continuará tendo uma visão por cliente e dia e será atualizado para a geração mais recente, sem afetar o histórico completo em `conteudo_posts`.
- A mesma mudança vale para tarefas recorrentes: o bloqueio diário passa a ser apenas de tarefa pendente ou em andamento, não de tarefa já concluída.

## Alterações previstas

- `supabase/functions/equipe-11ds-executar/index.ts`
  - Definir o contrato de direção de arte premium compartilhado.
  - Mudar a cadência para 1:1.
  - Enriquecer o briefing fotográfico, o payload de composição e a revisão final por visão.
  - Permitir registrar gerações distintas para a mesma data.
- `supabase/functions/equipe-11ds-calendario-executar/index.ts`
  - Usar a mesma sequência 1:1 para que planejamento e produção coincidam.
- `supabase/functions/equipe-11ds-diario/index.ts`
  - Remover os bloqueios por execução concluída no mesmo dia, mantendo prevenção de concorrência.
- Nova migration do Supabase
  - Remover a unicidade `conteudo_posts_cliente_data_unique` e manter o histórico de gerações.
- Serviço de composição externo
  - Receber o perfil visual explícito se o contrato atual não cobrir integralmente o cartão premium e o rodapé fotográfico. A função já fornece dados de modo, headline, cores, logo e handle; qualquer alteração de geometria do compositor exige atualização do serviço que está configurado fora deste repositório.

## Tratamento de falhas

- Falha de pesquisa, memória ou revisão visual não interrompe a geração; é registrada e o post permanece como rascunho.
- Falha de composição, upload ou geração de imagem interrompe somente a tarefa correspondente e a marca como erro, permitindo nova execução.
- A refação visual é limitada a uma tentativa, impedindo loops e custos sem controle.
- Campos críticos ausentes, como fundo fixo no modo tipográfico ou configuração do compositor, continuam falhando com mensagem clara.

## Verificação

- Validar a sequência 1:1 nas duas funções que calculam calendário.
- Exercitar duas rotinas no mesmo dia e confirmar duas gerações preservadas para o mesmo cliente.
- Confirmar que uma execução simultânea não cria tarefas concorrentes equivalentes.
- Validar que o calendário aponta para a geração mais recente, enquanto a lista de posts preserva todas as versões.
- Inspecionar payloads tipográfico e fotográfico para logo, handle, headline, cor e perfil visual.
- Executar verificações estáticas/lint aplicáveis às funções e revisar as alterações de migration antes do deploy.
