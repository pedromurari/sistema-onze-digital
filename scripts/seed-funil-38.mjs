// seed-funil-38.mjs — Gera funil completo da Turma #38
// Executar: node scripts/seed-funil-38.mjs

const SUPABASE_URL = 'https://usqiyekfmwwnvkmkdlej.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcWl5ZWtmbXd3bnZrbWtkbGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTM5MTIsImV4cCI6MjA5MDEyOTkxMn0.HImguQINgMUvuetgIfDL3sr7KwhSWGoXvaNMKldxYmQ';

const FUNNEL_NAME = 'Turma #38';
const G1 = '{{grupo_1}}';
const G2 = '{{grupo_2}}';
const SLOGAN = 'Excelente';
const PROF = 'Keila';
const PROF_CONV = null; // sem professor convidado
const HORA_LIVE = '20:00';
const LINK_CHECKOUT = 'https://www.idmpsi.com.br/lancamento';

const AULAS = [
  { data: '2026-06-30', hora: '20:00', link: 'https://youtube.com/live/VvmEH5LlC_0?feature=share', titulo: null },
  { data: '2026-07-01', hora: '20:00', link: 'https://youtube.com/live/NxnyXcM7WXE?feature=share', titulo: null },
  { data: '2026-07-02', hora: '20:00', link: 'https://youtube.com/live/hiBJtMBPgu0?feature=share', titulo: null },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(date, hora) {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function fmtDate(iso) {
  if (!iso) return '{{data}}';
  const [, mo, dy] = iso.split('-');
  return `${dy}/${mo}`;
}

function fmtDayWeek(iso) {
  if (!iso) return '';
  const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  return days[new Date(iso + 'T12:00:00').getDay()];
}

function fmtHora(hhmm) {
  return hhmm.replace(':00','h').replace(':','h');
}

function checkVar(text) {
  return /\{\{[^}]+\}\}/.test(text);
}

function textMsg(fn, day, scheduledAt, recipId, text, label, opts = {}) {
  return {
    funnel_name: fn, day_number: day,
    scheduled_at: scheduledAt.toISOString(),
    recipient_type: 'group', recipient_id: recipId,
    message_type: 'text', message_text: text,
    link_preview: false, mention_everyone: false,
    send_header_image: false, update_group_picture: false,
    subtipo: null, status: checkVar(text) ? 'draft' : 'scheduled',
    ...opts,
  };
}

function pollMsg(fn, day, scheduledAt, recipId, pollName, pollOptions, label) {
  return {
    funnel_name: fn, day_number: day,
    scheduled_at: scheduledAt.toISOString(),
    recipient_type: 'group', recipient_id: recipId,
    message_type: 'poll', message_text: '',
    link_preview: false, mention_everyone: false,
    send_header_image: false, update_group_picture: false,
    subtipo: null, status: 'scheduled',
    poll_name: pollName, poll_options: pollOptions,
    poll_selectable_count: 1,
  };
}

// ─── config derivado ──────────────────────────────────────────────────────────

const numAulas = AULAS.length;
const profDupla = PROF_CONV ? `${PROF} e ${PROF_CONV}` : PROF;
const classHora = fmtHora(HORA_LIVE);
const firstClassDate = new Date(AULAS[0].data + 'T12:00:00');

const aulaLink  = (n) => AULAS[n-1]?.link  || `{{link_aula_${n}}}`;
const aulaTit   = (n) => AULAS[n-1]?.titulo?.trim() || `Aula ${n}`;
const aulaData  = (n) => AULAS[n-1]?.data ? fmtDate(AULAS[n-1].data) : `{{data_aula_${n}}}`;
const aulaDia   = (n) => AULAS[n-1]?.data ? fmtDayWeek(AULAS[n-1].data) : '';
const aulaHora  = (n) => AULAS[n-1]?.hora || '20:00';
const aulaH     = (n) => fmtHora(aulaHora(n));

const datesBlock = () => Array.from({length: numAulas}, (_,i) =>
  `📅 Aula ${i+1} - *${aulaTit(i+1)}* (${aulaData(i+1)})`
).join('\n');

const linksBlock = () => Array.from({length: numAulas}, (_,i) =>
  `🔗 Aula ${i+1}: ${aulaLink(i+1)}`
).join('\n');

// ─── mensagens manhã (warmup) ─────────────────────────────────────────────────

const manhasMsgs = {
  1: `${SLOGAN} dia! ☀️

Freud disse uma coisa que abalou o mundo científico em 1917:

*"O ego não é senhor em sua própria casa."*

Antes disso, acreditávamos que nossas decisões vinham de um lugar racional e consciente. Que éramos autores plenos das nossas escolhas.

Freud mostrou que não. Que a parte mais determinante de quem somos opera nas sombras — sem que a gente perceba, sem que a gente autorize.

O inconsciente está por trás de cada padrão que você repete, de cada reação que te surpreende, de cada decisão que você não sabe explicar.

Nessas aulas, vamos abrir esse acesso. Com profundidade. Com direção.

${datesBlock()}

Sempre às *${classHora}*, ao vivo no YouTube.
Com ${profDupla}.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com ❤️ pra eu saber que você está aqui!`,

  2: `${SLOGAN} dia! ☀️

Em 1920, Freud observou algo perturbador nos seus pacientes:

Eles repetiam situações dolorosas. Não porque queriam sofrer — mas porque o inconsciente insistia em reencenar o que ficou irresolvido.

Chamou isso de *compulsão à repetição*.

Você provavelmente conhece bem esse movimento:
↳ O mesmo tipo de relacionamento que termina sempre do mesmo jeito
↳ A mesma autossabotagem toda vez que você estava quase chegando lá
↳ O mesmo conflito — com pessoas diferentes

Não é azar. Não é coincidência.
É o inconsciente tentando te dar uma nova chance — do único jeito que sabe.

Nossas aulas chegam em breve. Você vai entender por onde começa a saída.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 🔄 se você já se percebeu repetindo um padrão que queria ter quebrado.`,

  3: `${SLOGAN} dia! ☀️

Anna Freud — filha de Sigmund e psicanalista por direito próprio — passou anos mapeando algo que todo ser humano faz:

*Defender-se do que dói.*

Você racionaliza. Projeta. Nega. Intelectualiza.
Faz humor sobre o que te machuca antes que alguém perceba que machucou.

Isso não é fraqueza. É o aparelho psíquico fazendo o que foi treinado a fazer: proteger você da dor que ainda não tem como ser processada.

O problema é que esses mecanismos, com o tempo, também te impedem de crescer. De sentir. De se conectar de verdade.

A psicanálise não destrói as defesas. Ela te ajuda a entender o que está por baixo delas — para que você possa *escolher*, em vez de apenas reagir.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 🛡️ se você se reconhece em algum desses mecanismos.`,

  4: `${SLOGAN} dia! ☀️

Freud descobriu algo que virou a base de toda a clínica psicanalítica:

O que sentimos pelas pessoas ao nosso redor raramente é *só* sobre elas.

É sobre quem elas *representam* — figuras do passado, imagens internalizadas, afetos que ainda não foram elaborados.

Isso se chama *transferência*.

E ela não acontece só no divã. Ela acontece com seu chefe, seu parceiro, seus filhos — em qualquer relação onde há afeto em jogo.

↳ O julgamento instantâneo de alguém que você mal conhece
↳ A raiva desproporcional que um comportamento simples desperta
↳ A admiração que vira dependência antes que você perceba

Tudo isso tem uma história. Tudo isso tem um endereço no inconsciente.

Entender a transferência é começar a se relacionar com mais clareza — e com muito mais liberdade.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 👁️ se você já viveu uma relação que te ensinou algo profundo sobre você mesmo.`,

  5: `${SLOGAN} dia! ☀️

Jacques Lacan — um dos pensadores mais radicais da psicanálise — disse uma frase que incomoda:

*"O sintoma é uma metáfora."*

Não é filosofia abstrata. É uma observação precisa sobre como o inconsciente funciona.

O sintoma *fala*. Por baixo de cada compulsão, cada bloqueio, cada dor que persiste sem explicação — há algo que o inconsciente não conseguiu dizer de outra forma.

↳ A ansiedade que não passa, mesmo quando "não tem motivo"
↳ A procrastinação que aparece toda vez que você está perto de algo importante
↳ O relacionamento que dói mas você não consegue largar

Esses não são defeitos. São mensagens.

Quando você aprende a escutá-las — em vez de silenciá-las — a relação com você mesmo muda completamente.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 💭 se você tem um sintoma que já tentou eliminar e ele sempre volta.`,

  6: `${SLOGAN} dia! ☀️

Freud descobriu algo que a maioria das pessoas não quer ouvir:

A voz mais cruel dentro de você não vem de fora. Ela vem de dentro.

Chamou-a de *superego* — a instância psíquica que internalizou as exigências do mundo e as transformou em tribunal interno.

Ela compara. Ela condena. Ela nunca está satisfeita.

E é, muitas vezes, *mais severa* do que qualquer pessoa real jamais foi com você.

_"Não fiz o suficiente. Deveria ser mais. Os outros conseguem — por que eu não?"_

Essa voz não é a verdade. É uma construção — formada nas primeiras experiências de aprovação e rejeição, de amor condicional, de exigência não dita.

Entender de onde ela vem não a silencia de imediato. Mas tira dela o poder de governar sua vida sem que você perceba.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 🔇 se essa voz fala alto demais dentro de você.`,

  7: `${SLOGAN} dia! ☀️

Lacan disse algo que levou anos para eu entender completamente:

*"O desejo é o desejo do Outro."*

Não é filosofia abstrata. É uma observação devastadoramente precisa sobre como vivemos.

Grande parte do que perseguimos — o sucesso, a aprovação, a conquista — não é o que *nós* queremos de verdade.

É o que aprendemos a querer para ser amados. Vistos. Aceitos.

E aí vem o paradoxo que tantos vivem:
Quando você finalmente conquista aquilo que perseguiu a vida toda, descobre que não era bem isso.

Porque o desejo real estava encoberto pelo desejo que o Outro — a família, a cultura, o olhar social — depositou em você.

Descobrir o que você *realmente* deseja, por baixo de todas essas camadas, é um dos movimentos mais libertadores que a psicanálise pode provocar.

${datesBlock()}

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 🔍 se você sente que busca uma coisa mas no fundo quer outra.`,

  8: `${SLOGAN} dia! ☀️

Freud notou que seus pacientes — mesmo querendo mudar — resistiam ao próprio tratamento.

Chegavam atrasados. Esqueciam o que haviam dito na sessão anterior. Mudavam de assunto nos momentos de maior avanço.

Chamou isso de *resistência*.

E a descoberta mais importante: a resistência não é fraqueza nem falta de vontade.

É proteção.

O inconsciente prefere o sofrimento *conhecido* ao desconhecido que a mudança traz. Porque mudar significa abandonar uma identidade — por mais dolorosa que seja — antes de saber quem você vai ser do outro lado.

Por isso você se sabota quando está quase chegando.
Por isso a mudança parece impossível mesmo quando você já sabe o que precisa fazer.

A resistência não precisa ser vencida pela força. Ela precisa ser *compreendida*.

E é exatamente isso que começa amanhã.

👉 Ativa o lembrete e deixa o like:
${aulaLink(1)}

Reage com 🚧 se você já se percebeu se sabotando quando estava quase chegando lá.`,

  9: `${SLOGAN} dia! ☀️

Winnicott — psicanalista inglês que dedicou a vida a entender como nos tornamos quem somos — falou sobre o *self verdadeiro*:

A parte de você que foi se escondendo com o tempo.
Que aprendeu a performar, a agradar, a caber no espaço que o mundo oferecia.

*Amanhã começa um espaço diferente.*

Você passou por 8 dias de reflexão — cada mensagem foi uma semente plantada no solo certo.

O inconsciente. A repetição. Os mecanismos de defesa.
A transferência. O sintoma. O superego. O desejo. A resistência.

Amanhã, ao vivo, começamos a aprofundar cada um desses fios — juntos.

${PROF} conduz essa jornada${PROF_CONV ? ` com participação de ${PROF_CONV}` : ''}.

👉 Ativa o lembrete e deixa o like — começa amanhã:
${aulaLink(1)}

Reage com 🙌 se você vai estar ao vivo amanhã!`,
};

// ─── enquetes (warmup) ────────────────────────────────────────────────────────

const enquetesDias = {
  1: {
    intro: `${SLOGAN} tarde! ☀️\n\nO ego não manda sozinho — mesmo que a gente viva como se mandasse.\n\nUm jeito rápido de perceber isso na prática:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 🧠 nessa mensagem!`,
    nome: 'O que mais controla suas decisões no dia a dia?',
    opcoes: ['A razão — eu penso antes de agir','A emoção do momento — decido no impulso','O medo do que os outros vão pensar','Um padrão automático que nem percebo'],
  },
  2: {
    intro: `${SLOGAN} tarde! ☀️\n\nHoje falamos sobre compulsão à repetição — os padrões que se repetem sem que a gente perceba.\n\nUma pergunta direta:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'O que você mais se pega repetindo na sua vida?',
    opcoes: ['Relacionamentos que seguem sempre o mesmo roteiro','Me saboto quando estou perto de conquistar algo','Brigas e conflitos com as mesmas pessoas','Promessas que faço e não cumpro pra mim mesmo'],
  },
  3: {
    intro: `${SLOGAN} tarde! ☀️\n\nHoje falamos sobre mecanismos de defesa — as formas que a mente encontra de se proteger do que dói.\n\nAgora a sua vez de olhar para dentro:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'Como você reage quando algo te machuca de verdade?',
    opcoes: ['Finjo que não afetou tanto','Racionalizo e tento entender tudo','Fico irritado com outras coisas sem perceber','Me isolo e processo sozinho'],
  },
  4: {
    intro: `${SLOGAN} tarde! ☀️\n\nO que você sente pelas pessoas raramente é só sobre elas — é sobre quem elas representam pra você.\n\nUma pergunta pra olhar isso de perto:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💭 nessa mensagem!`,
    nome: 'Quando alguém te irrita fora do normal, o que geralmente está por trás?',
    opcoes: ['Me lembra alguém do meu passado','Toca numa insegurança minha','É só a pessoa mesmo, sem segundas intenções','Nunca parei pra pensar nisso'],
  },
  5: {
    intro: `${SLOGAN} tarde! ☀️\n\nO sintoma é uma mensagem do inconsciente — não um defeito a ser eliminado.\n\nQual é o sintoma que mais aparece na sua vida?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'Qual sintoma mais aparece na sua vida hoje?',
    opcoes: ['Ansiedade constante que não consigo parar','Procrastinação que me trava na hora de agir','Relacionamento que dói mas não consigo largar','Sensação de vazio mesmo quando tudo está bem'],
  },
  6: {
    intro: `${SLOGAN} tarde! ☀️\n\nFalamos sobre o superego — a voz interna que cobra, compara e exige mais de você.\n\nDe que forma essa voz aparece mais forte em você?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'Como a autocrítica aparece mais forte em você?',
    opcoes: ['Me comparo com os outros o tempo todo','Nunca acho que fiz o suficiente','Me cobro por erros que já deveriam ter passado','Tenho medo de parecer fraco ou incapaz'],
  },
  7: {
    intro: `${SLOGAN} tarde! ☀️\n\nLacan dizia que desejamos muito do que achamos que os outros esperam de nós — nem sempre o que é nosso de verdade.\n\nUma pergunta pra encerrar essa semana de preparação:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um ✨ nessa mensagem!`,
    nome: 'O que mais pesa quando você pensa em mudar de vida?',
    opcoes: ['Medo de decepcionar quem espera algo de mim','Não sei separar o que eu quero do que "deveria" querer','Já sei o que quero, só falta agir','Ainda estou descobrindo o que realmente quero'],
  },
  8: {
    intro: `${SLOGAN} tarde! ☀️\n\nA resistência é o psiquismo protegendo o familiar — mesmo que seja doloroso.\n\nO que mais te impede de mudar quando você já sabe o que precisa?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'O que mais te impede de mudar quando você já sabe o que precisa?',
    opcoes: ['Medo de falhar de novo','Conforto no que é familiar, mesmo que doa','Não me sentir pronto ou merecedor','Medo do que as pessoas vão pensar'],
  },
  9: {
    intro: `${SLOGAN} tarde! ☀️\n\nAmanhã começa nossa jornada — esta é a última enquete antes das aulas.\n\nUma pergunta que vai te carregar para dentro da primeira aula:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
    nome: 'Qual é a maior transformação que você quer carregar das nossas aulas?',
    opcoes: ['Parar de me sabotar e agir com mais coragem','Entender por que repito os mesmos padrões','Me libertar da autocrítica que me paralisa','Criar relacionamentos mais honestos e reais'],
  },
};

// ─── gerar mensagens ──────────────────────────────────────────────────────────

const msgs = [];
const warmupDays = 9;

for (let offset = -warmupDays; offset <= -1; offset++) {
  const l       = Math.abs(offset);
  const day     = warmupDays + offset + 1; // 1..9
  const dayDate = addDays(firstClassDate, offset);

  // Manhã
  msgs.push(textMsg(FUNNEL_NAME, day, setTime(dayDate, '08:00'), G1,
    manhasMsgs[day], `Dia ${day} — Manhã`, { link_preview: true }));

  // Tarde (enquete todo dia de aquecimento)
  {
    const eq = enquetesDias[day];
    msgs.push(textMsg(FUNNEL_NAME, day, setTime(dayDate, '15:00'), G1, eq.intro,
      `Dia ${day} — Enquete (intro)`));
    msgs.push(pollMsg(FUNNEL_NAME, day,
      new Date(setTime(dayDate, '15:00').getTime() + 3 * 60 * 1000),
      G1, eq.nome, eq.opcoes, `Dia ${day} — Enquete`));
  }

  // Noite
  const noiteTxt = offset === -1
    ? `${SLOGAN} noite! 🌙\n\n*AMANHÃ, ${classHora}. Ao vivo.*\n\nAula 1 - *${aulaTit(1)}*.\n\nSe você ativar só um lembrete agora, que seja esse:\n\n👉 ${aulaLink(1)}\n\nE já aproveita pra ativar os lembretes das próximas aulas:\n${linksBlock()}\n\nReage com um 🚀 - amanhã a gente se encontra!`
    : `${SLOGAN} noite! 🌙\n\nFaltam *${l} dias* pra ${FUNNEL_NAME}.\n\n${numAulas} aulas ao vivo que podem mudar a forma como você se enxerga.\n\n👉 Já ativa os lembretes e deixa o like:\n\n${linksBlock()}\n\nReage com um 🔥 se você já está ansioso pra começar!`;

  const noiteHora = offset === -1 ? HORA_LIVE : '20:00';
  msgs.push(textMsg(FUNNEL_NAME, day, setTime(dayDate, noiteHora), G1, noiteTxt,
    `Dia ${day} — Noite`, { link_preview: true }));
}

// ─── dias de aula ─────────────────────────────────────────────────────────────

for (let i = 1; i <= numAulas; i++) {
  const aulaDateObj  = new Date(AULAS[i-1].data + 'T12:00:00');
  const dayNum       = warmupDays + i;
  const aulaDateHora = setTime(aulaDateObj, aulaHora(i));

  // Manhã
  msgs.push(textMsg(FUNNEL_NAME, dayNum, setTime(aulaDateObj, '08:00'), G1,
    `${SLOGAN} dia! ☀️\n\n*HOJE é o dia.*\n\nHoje às ${aulaH(i)} começa a Aula ${i} - *${aulaTit(i)}*.\n\n${profDupla} vão ao vivo conduzir essa experiência.\n\nSepara o caderno. Avisa a família. Hoje você tem um compromisso com você mesmo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🔥 se você vai estar lá HOJE!`,
    `${aulaTit(i)} — Manhã`, { link_preview: true }));

  // Tarde enquete
  msgs.push(textMsg(FUNNEL_NAME, dayNum, setTime(aulaDateObj, '15:00'), G1,
    `${SLOGAN} tarde! ☀️\n\nHoje às ${aulaH(i)} temos a Aula ${i} - *${aulaTit(i)}*! 🔴\n\n*Como você está chegando para a aula de hoje?*\n\nSeleciona a sua resposta 👇\n\nReage com um ✨ nessa mensagem!`,
    `${aulaTit(i)} — Enquete (intro)`));

  msgs.push(pollMsg(FUNNEL_NAME, dayNum,
    new Date(setTime(aulaDateObj, '15:00').getTime() + 3 * 60 * 1000),
    G1,
    'Como você está chegando para a aula de hoje?',
    ['Ansioso - mal posso esperar','Curioso - quero ver o que vai rolar','Reflexivo - já cheguei pensando','Pronto - bora viver isso ao vivo'],
    `${aulaTit(i)} — Enquete`));

  // Contagens regressivas
  const countdowns = [
    [-3, `⏰ *Faltam 3 HORAS pra Aula ${i} - ${aulaTit(i)}!*\n\nHoje às ${aulaH(i)}, ao vivo. Você não vai querer perder o início.\n\n👉 ${aulaLink(i)}\n\nReage com um ⏰!`, `${aulaTit(i)} — -3h`],
    [-2, `⏰ *Faltam 2 HORAS!*\n\nJá separa o caderno, o fone e um lugar tranquilo. Essa aula pede atenção total.\n\n👉 ${aulaLink(i)}\n\nReage com um 📝!`, `${aulaTit(i)} — -2h`],
    [-1, `⏰ *Falta 1 HORA pra começar!*\n\nDaqui a 60 minutos, ${profDupla} entram ao vivo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🚀 se já está se preparando!`, `${aulaTit(i)} — -1h`],
  ];

  for (const [offset, txt, label] of countdowns) {
    const t = new Date(aulaDateHora.getTime() + offset * 60 * 60 * 1000);
    msgs.push(textMsg(FUNNEL_NAME, dayNum, t, G1, txt, label,
      { link_preview: true, mention_everyone: offset === -1 }));
  }

  // Ao vivo
  msgs.push(textMsg(FUNNEL_NAME, dayNum, aulaDateHora, G1,
    `🔴 *ESTAMOS AO VIVO!*\n\nAula ${i} - *${aulaTit(i)}* - começou AGORA!\n\nCorre pra não perder o início 👇\n\n👉 ${aulaLink(i)}\n\nReage com um ❤️ e entra AGORA!`,
    `${aulaTit(i)} — AO VIVO`,
    { link_preview: true, mention_everyone: true }));

  // Provocações
  const provocacoes = [
    [10, `⚡ A aula já começou e a energia está absurda!\n\nSe você ainda não entrou, esse é o momento. Vem 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 1`],
    [20, `🧠 ${PROF} está ao vivo conduzindo pontos profundos agora.\n\nNão deixa pra depois - entra agora 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 2`],
    [30, `🌟 O ao vivo tem algo que o replay nunca vai te dar: a experiência de viver isso em tempo real.\n\nAinda dá tempo. Entra 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 3`],
    [40, `🎁 Atenção! Vai rolar *SORTEIO* pra quem está ao vivo!\n\nEntra agora e ainda dá tempo de participar 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 4`],
  ];

  for (const [min, txt, label] of provocacoes) {
    const t = new Date(aulaDateHora.getTime() + min * 60 * 1000);
    msgs.push(textMsg(FUNNEL_NAME, dayNum, t, G1, txt, label, { link_preview: true }));
  }
}

// ─── oferta pós-evento ────────────────────────────────────────────────────────

const diaOferta = addDays(firstClassDate, numAulas);
const baseDay   = warmupDays + numAulas;

msgs.push(textMsg(FUNNEL_NAME, baseDay + 1, setTime(diaOferta, '10:00'), G2,
  `Você acabou de passar por algo que a maioria das pessoas nunca vai ter acesso.\n\n${numAulas} aulas que foram fundo no que está por trás dos seus padrões.\n\nE agora você tem duas opções:\n\n1️⃣ Levar o que aprendeu e tentar aplicar sozinho — como já fez outras vezes.\n\n2️⃣ Continuar esse trabalho com estrutura, suporte e profundidade real.\n\nPara quem quer ir além, as matrículas abriram agora.\n\nSão vagas limitadas — e quem passou pelas aulas ao vivo tem prioridade.\n\n👉 ${LINK_CHECKOUT}\n\nAs vagas não esperam.`,
  'Oferta — Abertura', { link_preview: true, mention_everyone: true }));

msgs.push(textMsg(FUNNEL_NAME, baseDay + 2, setTime(addDays(diaOferta, 1), '19:00'), G2,
  `Ontem abriram as matrículas. E muita gente já garantiu a vaga.\n\nSe você ainda está pensando — entendo. Toda decisão real exige coragem.\n\nMas deixa eu te perguntar algo:\n\nO que vai ser diferente daqui a 6 meses se você continuar do jeito que está?\n\nOs mesmos padrões. Os mesmos ciclos. A mesma sensação de quase lá.\n\n👉 ${LINK_CHECKOUT}\n\nVagas ainda disponíveis — mas não por muito tempo.`,
  'Oferta — Follow-up +1', { link_preview: true, mention_everyone: true }));

msgs.push(textMsg(FUNNEL_NAME, baseDay + 3, setTime(addDays(diaOferta, 2), '18:00'), G2,
  `⚠️ *Amanhã encerram as matrículas.*\n\nSe você saiu das aulas sentindo que algo virou — o próximo passo está disponível agora.\n\nDepois de amanhã, não tem como garantir vaga.\n\n👉 ${LINK_CHECKOUT}`,
  'Oferta — Escassez +2', { link_preview: true, mention_everyone: true }));

msgs.push(textMsg(FUNNEL_NAME, baseDay + 4, setTime(addDays(diaOferta, 3), '12:00'), G2,
  `🔒 *Hoje é o último dia.*\n\nAs matrículas fecham à meia-noite.\n\nO momento certo não existe. Existe a decisão que você toma antes de estar completamente pronto.\n\nEssa decisão, tomada hoje, pode mudar o que vem depois.\n\n👉 ${LINK_CHECKOUT}\n\nDepois da meia-noite, a porta fecha.`,
  'Oferta — Encerramento +3', { link_preview: true, mention_everyone: true }));

// ─── inserir no Supabase ──────────────────────────────────────────────────────

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${path}: ${res.status} ${txt}`);
  }
}

async function main() {
  console.log(`\n🚀 Seeding funil "${FUNNEL_NAME}"...\n`);

  // 1. funnel_config
  console.log('📋 Criando funnel_config...');
  await sbPost('funnel_configs', {
    funnel_name: FUNNEL_NAME,
    grupo_1_id: '120363427851199732@g.us',
    grupo_2_id: '120363428317275689@g.us',
    imagem_manha: '',
    imagem_tarde: '',
    imagem_noite: '',
    variaveis: {
      grupo_1: '120363427851199732@g.us',
      grupo_2: '120363428317275689@g.us',
      link_aula_1: AULAS[0].link,
      link_aula_2: AULAS[1].link,
      link_aula_3: AULAS[2].link,
      link_checkout: LINK_CHECKOUT,
    },
    imagens: {},
  });
  console.log('  ✅ funnel_config criada');

  // 2. mensagens em lotes de 20
  const BATCH = 20;
  let inserted = 0;
  for (let i = 0; i < msgs.length; i += BATCH) {
    const batch = msgs.slice(i, i + BATCH);
    await sbPost('funnel_messages', batch);
    inserted += batch.length;
    console.log(`  ✅ ${inserted}/${msgs.length} mensagens inseridas`);
  }

  console.log(`\n✅ Funil "${FUNNEL_NAME}" criado com ${msgs.length} mensagens!\n`);

  // Resumo por dia
  const byDay = {};
  for (const m of msgs) {
    if (!byDay[m.day_number]) byDay[m.day_number] = 0;
    byDay[m.day_number]++;
  }
  console.log('📊 Mensagens por dia:');
  for (const [day, count] of Object.entries(byDay)) {
    const d = Number(day);
    let label;
    if (d <= 9)       label = `Warmup Dia ${d}`;
    else if (d <= 12) label = `Aula ${d - 9}`;
    else              label = `Oferta +${d - 13}`;
    console.log(`  Dia ${String(d).padStart(2)} (${label}): ${count} msgs`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
