# Canal Workshop — Da curiosidade à escuta

Produto de destino: Formação em Psicanálise Integrativa do IDM. Dono do conteúdo/gravação: Rodrygo Murari. Público: pessoas interessadas em comportamento humano e formação, sem pressupor experiência clínica. Uma edição gratuita está aberta para captação; a versão com ingresso fica inativa até Pedro definir preço, data e bônus final. Não divulgar como evento ao vivo com horário certo enquanto `inicio_em` estiver vazio.

## Copy da página gratuita

**Headline:** Um primeiro passo sério para estudar psicanálise.

**Subheadline:** Workshop gratuito: descubra como observar, escutar e estudar sem cair em diagnósticos rápidos.

**Abertura:** “Se você gosta de entender pessoas, talvez já tenha ouvido que tem ‘dom’ para ouvir. Isso é um ponto de partida, não uma formação. Neste encontro você vai ver por que escuta exige método, ética e estudo — e como começar sem promessas fáceis.”

**O que a pessoa leva:** diferença entre opinião e escuta; três perguntas abertas para conversas difíceis; um mapa de quatro pilares para avaliar uma formação; checklist de dez perguntas para decidir com consciência.

**Bônus:** Checklist “10 perguntas para escolher uma formação com consciência”. Entregar o arquivo real antes de anunciar o bônus em campanhas pagas. Até lá, a página pode apresentar o conteúdo como material em preparação.

**CTA:** “Garantir inscrição gratuita”. Formulário: nome, WhatsApp e e-mail opcional. O lead é marcado `canal=Workshop`, `origem=workshop:primeiros-passos-psicanalise` e vinculado à edição; não entra no funil do Webinário.

## Roteiro-base de 50 minutos para o encontro

**0–5 min, acolhida.** “Bem-vinda, bem-vindo. Eu sou Rodrygo, do IDM. Hoje vamos estudar uma diferença importante: gostar de ouvir não é o mesmo que saber sustentar uma escuta. Não será uma sessão de atendimento. Você não precisa contar sua história pessoal. Nosso objetivo é sair daqui com um critério para estudar melhor.” Explique que o exercício usa personagens fictícios e que qualquer tema sensível pode ser deixado de lado.

**5–15 min, demonstração.** Apresente a frase fictícia “Eu sempre acabo cedendo”. Mostre três respostas: conselho (“pare de ceder”), interpretação pronta (“você teme rejeição”) e pergunta aberta (“em que momentos você percebe que cede?”). Diga: “O conselho pode ser bem-intencionado. A interpretação pode soar inteligente. Mas, sem compreender a história singular, ambos podem encerrar a conversa cedo. A pergunta é uma forma de continuar estudando o que ainda não sabemos.” Faça outra rodada com “Tenho medo de desapontar minha família”.

**15–25 min, exercício.** Peça que cada participante escolha uma frase cotidiana não sensível e escreva uma observação e três perguntas que não contenham a resposta embutida. Dê dois minutos de silêncio. Leia exemplos fictícios, compare perguntas abertas e fechadas, e ressalte que o exercício é de aprendizagem, não de diagnóstico. “Se eu digo ‘Você não acha que deveria mudar?’, já coloquei minha opinião dentro da pergunta. Se pergunto ‘O que acontece quando tenta mudar?’, abro espaço para a pessoa falar.”

**25–35 min, quatro pilares da formação.** Teoria: leitura contextualizada em vez de frases de rede social. Escuta: praticar distinção entre o que foi dito e o que se supõe. Ética: limites, privacidade, encaminhamento e responsabilidade. Continuidade: estudo e supervisão depois de qualquer certificado. Para cada pilar, entregue uma pergunta que o aluno deve fazer a qualquer instituição. “Que autores estudarei? Como recebo feedback? Como são tratados os limites de atuação? Que espaços de continuidade existem?”

**35–43 min, ponte para a formação.** “Hoje você teve uma amostra do tipo de pergunta que sustenta o estudo. Se quer aprofundar em teoria, prática reflexiva e ética, conheça a Formação em Psicanálise Integrativa do IDM. Veja programa, formato, calendário e investimento vigentes na página oficial; converse com a equipe antes de decidir. Não prometo que uma formação resolva todos os seus problemas ou garanta uma profissão. Convido você a examinar se este percurso faz sentido para seu objetivo e sua rotina.” Mostre onde clicar para falar com a equipe e conhecer as condições atuais, sem anunciar preço de memória.

**43–50 min, perguntas e encerramento.** Responda dúvidas gerais sobre o percurso, sem interpretar histórias pessoais no grupo. “Se uma pergunta exigir detalhes do seu caso, o espaço adequado é outro. Hoje podemos falar de estudo e de escolhas de formação.” Feche retomando o critério: “Não compre uma promessa de entender todo mundo. Escolha um caminho para continuar perguntando com responsabilidade.”

## Edição com ingresso

Tema: **A escuta na prática**. Headline: **Aprenda a trocar respostas prontas por perguntas melhores**. Promessa limitada: exercícios guiados e caderno de prática, sem atendimento individual. Bônus proposto: caderno de exercícios de escuta e roteiro de estudo. **Não inventar escassez nem abrir a cobrança antes de definir valor e produzir o bônus.** No CRM, configure o preço em reais e ative a edição; o formulário cria uma inscrição pendente e redireciona para checkout do Mercado Pago. Somente confirmação consultada no gateway altera o status para “pago”. Testar o fluxo com ambiente/valor autorizado antes da primeira venda real.

## Próximos passos de operação

1. Pedagógico revisa termos e exemplos; Rodrygo confirma roteiro e grava os três vídeos dos webinários.
2. Pedro define data/valor do workshop pago e aprova o bônus real.
3. Marketing divulga cada URL com UTMs próprias, sem misturar as campanhas.
4. Comercial acompanha inscrições/interesse por edição no menu Workshop; o webinar mantém seu quadro separado.
# Estado da implementação (24/10/2026)

O canal interno está em **Canais de Aquisição > Workshop**, com visão geral,
leads, Kanban e configuração de edições. A página gratuita está publicada em
https://sistema.idmpsi.com.br/workshop/primeiros-passos-psicanalise e o
cadastro foi testado na função pública, inclusive consulta de status. O lead
de teste foi removido depois. O bônus é
https://sistema.idmpsi.com.br/checklist-formacao-psicanalise.md.

A edição paga `escuta-na-pratica` está **desativada**: falta Pedro definir
valor, data e condições reais antes de abrir checkout. O fluxo de pagamento
foi implementado, mas não houve transação financeira de teste; não afirmar
que o checkout pago foi validado. A edição gratuita também aguarda data de
realização e distribuição do acesso ao encontro. A página comunica isso.

Migration aditiva aplicada: `20261024030000_workshops_canal.sql`. Aplicação
pela Management API; reconciliar histórico antes de `supabase db push`.

