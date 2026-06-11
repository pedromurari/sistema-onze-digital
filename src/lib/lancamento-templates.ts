/**
 * lancamento-templates.ts
 * Gera sequência padrão de mensagens para um lançamento ou NPA.
 *
 * Lançamento — 9 dias de aquecimento + dias de aula:
 *   Manhã (8h)  — reflexão única de psicanálise por dia (inconsciente, repetição,
 *                 defesas, transferência, sintoma, superego, desejo, resistência, véspera)
 *   Tarde (15h) — enquete única por dia (dias 2,3,5,6,8,9) ou áudio (dias 1,4,7)
 *   Noite (20h) — links + countdown (véspera usa horário da aula)
 *
 * Dias de aula: manhã, tarde (enquete), contagem (-3h/-2h/-1h),
 *               ao vivo, provocações (+10/+20/+30/+40min)
 */

export interface AulaConfig {
  titulo?: string;
  data: string;      // 'YYYY-MM-DD'
  hora: string;      // 'HH:MM'
  link: string;
  professor: string;
}

export interface GrupoConfig {
  nickname: string;
  jid: string;
  link?: string;
  participantes?: string[];
}

export interface WizardConfig {
  // Etapa 1
  nome: string;
  tipo: 'lancamento' | 'npa';
  data_live: string;
  hora_live: string;
  meta_leads: number;
  meta_matriculas: number;
  responsavel_id: string;
  slogan: string;                 // saudação (ex: "Excelente", "Bom", "Ótimo")
  professor_convidado?: string;   // professor convidado / dupla

  // Etapa 2
  turma_destino_id: string;
  produto_destino: string;
  valor_mensalidade_destino: number;
  dia_vencimento_destino: number;
  total_mensalidades_destino: number;

  // Etapa 3 — grupos
  quantidade_grupos: 1 | 2;
  grupos: GrupoConfig[];
  instancia_evolution: string;
  vega_produto_id?: string;
  vega_produto_tarde?: string;

  // Etapa 4
  aulas: AulaConfig[];
  links_extras: Array<{ key: string; value: string }>;

  // Etapa 5
  bv_wpp_ativo: boolean;
  bv_wpp_mensagem: string;
  bv_wpp_mensagem_tarde?: string;
  pix_mensagem_template?: string;
  bv_email_ativo: boolean;
  bv_email_assunto: string;
  bv_email_corpo: string;
  bv_delay_minutos: number;
}

export interface TemplateMensagem {
  day_number: number;
  scheduled_at: string;
  recipient_type: 'group' | 'number';
  recipient_id: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'poll';
  message_text: string;
  link_preview: boolean;
  mention_everyone: boolean;
  send_header_image: boolean;
  update_group_picture: boolean;
  subtipo: string;
  status: 'scheduled' | 'draft';
  funnel_name: string;
  label: string;
  hasUnresolvedVar: boolean;
  poll_name?: string;
  poll_options?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function setTime(date: Date, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function toISO(d: Date): string { return d.toISOString(); }

function fmtDate(iso: string): string {
  if (!iso) return '{{data}}';
  const [, mo, dy] = iso.split('-');
  return `${dy}/${mo}`;
}

function fmtDayWeek(iso: string): string {
  if (!iso) return '';
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return days[new Date(iso + 'T12:00:00').getDay()];
}

function fmtHora(hhmm: string): string {
  // "20:00" → "20h" | "19:30" → "19h30"
  return hhmm.replace(':00', 'h').replace(':', 'h');
}

function checkVar(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text);
}

// ─── Construtores de mensagem ─────────────────────────────────────────────────

function textMsg(
  fn: string, day: number, scheduledAt: Date,
  recipientId: string, text: string, label: string,
  opts: Partial<TemplateMensagem> = {},
): TemplateMensagem {
  return {
    day_number: day, scheduled_at: toISO(scheduledAt),
    recipient_type: 'group', recipient_id: recipientId,
    message_type: 'text', message_text: text,
    link_preview: false, mention_everyone: false,
    send_header_image: false, update_group_picture: false,
    subtipo: '', status: 'scheduled', funnel_name: fn,
    label, hasUnresolvedVar: checkVar(text), ...opts,
  };
}

function pollMsg(
  fn: string, day: number, scheduledAt: Date,
  recipientId: string, pollName: string, pollOptions: string[], label: string,
): TemplateMensagem {
  return {
    day_number: day, scheduled_at: toISO(scheduledAt),
    recipient_type: 'group', recipient_id: recipientId,
    message_type: 'poll', message_text: '',
    link_preview: false, mention_everyone: false,
    send_header_image: false, update_group_picture: false,
    subtipo: '', status: 'scheduled', funnel_name: fn,
    label, hasUnresolvedVar: false,
    poll_name: pollName, poll_options: pollOptions,
  };
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateLancamentoMessages(config: WizardConfig): TemplateMensagem[] {
  if (!config.data_live) return [];

  const fn  = config.nome;
  const g1  = '{{grupo_1}}';
  const g2  = config.grupos.length >= 2 ? '{{grupo_2}}' : '{{grupo_1}}';

  const aula     = (n: number) => config.aulas[n - 1];
  const aulaTit  = (n: number) => aula(n)?.titulo?.trim() || `Aula ${n}`;
  const aulaData = (n: number) => aula(n)?.data ? fmtDate(aula(n).data) : `{{data_aula_${n}}}`;
  const aulaDia  = (n: number) => aula(n)?.data ? fmtDayWeek(aula(n).data) : '';
  const aulaHora = (n: number) => aula(n)?.hora || '20:00';
  const aulaH    = (n: number) => fmtHora(aulaHora(n));
  const aulaLink = (n: number) => aula(n)?.link || `{{link_aula_${n}}}`;

  const numAulas = config.tipo === 'lancamento'
    ? Math.min(config.aulas.length || 3, 3)
    : 1;

  const msgs: TemplateMensagem[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // LANÇAMENTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (config.tipo === 'lancamento') {

    const slogan    = config.slogan || 'Excelente';
    const profAnchor = config.aulas[0]?.professor || '{{professor}}';
    const profConv   = config.professor_convidado?.trim() || 'Convidado(a) especial';
    const profDupla  = `${profAnchor} e ${profConv}`;
    const classHora  = fmtHora(config.hora_live || '20:00');
    const produto    = config.produto_destino || 'psicanálise';

    const firstClassDate = new Date(
      (config.aulas[0]?.data || config.data_live) + 'T12:00:00'
    );

    // bloco datas das aulas
    const datesBlock = () => Array.from({ length: numAulas }, (_, i) =>
      `📅 Aula ${i + 1} - *${aulaTit(i + 1)}* (${aulaData(i + 1)})`
    ).join('\n');

    // bloco links
    const linksBlock = () => Array.from({ length: numAulas }, (_, i) =>
      `🔗 Aula ${i + 1}: ${aulaLink(i + 1)}`
    ).join('\n');

    // ── 9 dias de aquecimento ─────────────────────────────────────────────────
    const warmupDays = 9;

    // Mensagens únicas de manhã — reflexão de psicanálise por dia com referência de psicanalista (day 1..9)
    const manhasMsgs: Record<number, string> = {
      // Dia 1 — Inconsciente (Freud)
      1: `${slogan} dia! ☀️

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

      // Dia 2 — Compulsão à repetição (Freud — Além do Princípio do Prazer, 1920)
      2: `${slogan} dia! ☀️

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

      // Dia 3 — Mecanismos de defesa (Anna Freud — O Ego e os Mecanismos de Defesa, 1936)
      3: `${slogan} dia! ☀️

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

      // Dia 4 — Transferência (Freud)
      4: `${slogan} dia! ☀️

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

      // Dia 5 — Sintoma (Lacan — Escritos, 1966)
      5: `${slogan} dia! ☀️

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

      // Dia 6 — Superego (Freud — O Eu e o Id, 1923)
      6: `${slogan} dia! ☀️

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

      // Dia 7 — Desejo (Lacan — Seminário 6: O Desejo e sua Interpretação, 1958-59)
      7: `${slogan} dia! ☀️

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

      // Dia 8 — Resistência (Freud — A Interpretação dos Sonhos, 1900)
      8: `${slogan} dia! ☀️

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

      // Dia 9 — Véspera / Self verdadeiro (Winnicott — O Amadurecimento e o Ambiente Facilitador, 1965)
      9: `${slogan} dia! ☀️

Winnicott — psicanalista inglês que dedicou a vida a entender como nos tornamos quem somos — falou sobre o *self verdadeiro*:

A parte de você que foi se escondendo com o tempo.
Que aprendeu a performar, a agradar, a caber no espaço que o mundo oferecia.

*Amanhã começa um espaço diferente.*

Você passou por 8 dias de reflexão — cada mensagem foi uma semente plantada no solo certo.

O inconsciente. A repetição. Os mecanismos de defesa.
A transferência. O sintoma. O superego. O desejo. A resistência.

Amanhã, ao vivo, começamos a aprofundar cada um desses fios — juntos.

${profAnchor} conduz essa jornada com participação de ${profConv}.

👉 Ativa o lembrete e deixa o like — começa amanhã:
${aulaLink(1)}

Reage com 🙌 se você vai estar ao vivo amanhã!`,
    };

    // Enquetes únicas por dia (dias 2,3,5,6,8,9 — os não-áudio)
    const enquetesDias: Record<number, { intro: string; nome: string; opcoes: string[] }> = {
      2: {
        intro: `${slogan} tarde! ☀️\n\nHoje falamos sobre compulsão à repetição — os padrões que se repetem sem que a gente perceba.\n\nUma pergunta direta:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'O que você mais se pega repetindo na sua vida?',
        opcoes: ['Relacionamentos que seguem sempre o mesmo roteiro', 'Me saboto quando estou perto de conquistar algo', 'Brigas e conflitos com as mesmas pessoas', 'Promessas que faço e não cumpro pra mim mesmo'],
      },
      3: {
        intro: `${slogan} tarde! ☀️\n\nHoje falamos sobre mecanismos de defesa — as formas que a mente encontra de se proteger do que dói.\n\nAgora a sua vez de olhar para dentro:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'Como você reage quando algo te machuca de verdade?',
        opcoes: ['Finjo que não afetou tanto', 'Racionalizo e tento entender tudo', 'Fico irritado com outras coisas sem perceber', 'Me isolo e processo sozinho'],
      },
      5: {
        intro: `${slogan} tarde! ☀️\n\nO sintoma é uma mensagem do inconsciente — não um defeito a ser eliminado.\n\nQual é o sintoma que mais aparece na sua vida?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'Qual sintoma mais aparece na sua vida hoje?',
        opcoes: ['Ansiedade constante que não consigo parar', 'Procrastinação que me trava na hora de agir', 'Relacionamento que dói mas não consigo largar', 'Sensação de vazio mesmo quando tudo está bem'],
      },
      6: {
        intro: `${slogan} tarde! ☀️\n\nFalamos sobre o superego — a voz interna que cobra, compara e exige mais de você.\n\nDe que forma essa voz aparece mais forte em você?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'Como a autocrítica aparece mais forte em você?',
        opcoes: ['Me comparo com os outros o tempo todo', 'Nunca acho que fiz o suficiente', 'Me cobro por erros que já deveriam ter passado', 'Tenho medo de parecer fraco ou incapaz'],
      },
      8: {
        intro: `${slogan} tarde! ☀️\n\nA resistência é o psiquismo protegendo o familiar — mesmo que seja doloroso.\n\nO que mais te impede de mudar quando você já sabe o que precisa?\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'O que mais te impede de mudar quando você já sabe o que precisa?',
        opcoes: ['Medo de falhar de novo', 'Conforto no que é familiar, mesmo que doa', 'Não me sentir pronto ou merecedor', 'Medo do que as pessoas vão pensar'],
      },
      9: {
        intro: `${slogan} tarde! ☀️\n\nAmanhã começa nossa jornada — esta é a última enquete antes das aulas.\n\nUma pergunta que vai te carregar para dentro da primeira aula:\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`,
        nome: 'Qual é a maior transformação que você quer carregar das nossas aulas?',
        opcoes: ['Parar de me sabotar e agir com mais coragem', 'Entender por que repito os mesmos padrões', 'Me libertar da autocrítica que me paralisa', 'Criar relacionamentos mais honestos e reais'],
      },
    };

    for (let offset = -warmupDays; offset <= -1; offset++) {
      const l       = Math.abs(offset);
      const day     = warmupDays + offset + 1;   // 1..9
      const dayDate = addDays(firstClassDate, offset);

      // Manhã — reflexão única de psicanálise por dia
      msgs.push(textMsg(fn, day, setTime(dayDate, '08:00'), g1, manhasMsgs[day],
        `Dia ${day} — Manhã`, { link_preview: true }));

      // Tarde: a cada 3 dias sugere áudio (dias 1,4,7 do warmup), outros dias enquete única
      if (l % 3 === 0) {
        const audioTxt = `${slogan} tarde! ☀️\n\n🎙️ *Áudio sugerido do Prof. ${profAnchor}:*\n\n"${slogan}, pessoal! Estamos chegando muito perto da nossa primeira aula. Quero te encontrar ao vivo no dia ${aulaData(1)}, às ${classHora}, para abrir essa jornada com profundidade e direção."\n\n👉 ${aulaLink(1)}\n\nReage com um ❤️ depois de ouvir!`;
        msgs.push(textMsg(fn, day, setTime(dayDate, '15:00'), g1, audioTxt,
          `Dia ${day} — Tarde (Áudio)`, { subtipo: 'audio' }));
      } else {
        const eq = enquetesDias[day];
        msgs.push(textMsg(fn, day, setTime(dayDate, '15:00'), g1, eq.intro,
          `Dia ${day} — Enquete (intro)`));
        msgs.push(pollMsg(fn, day,
          new Date(setTime(dayDate, '15:00').getTime() + 3 * 60 * 1000),
          g1, eq.nome, eq.opcoes,
          `Dia ${day} — Enquete`));
      }

      // Noite
      const noiteTxt = offset === -1
        ? `${slogan} noite! 🌙\n\n*AMANHÃ, ${classHora}. Ao vivo.*\n\nAula 1 - *${aulaTit(1)}*.\n\nSe você ativar só um lembrete agora, que seja esse:\n\n👉 ${aulaLink(1)}\n\nE já aproveita pra ativar os lembretes das próximas aulas:\n${linksBlock()}\n\nReage com um 🚀 - amanhã a gente se encontra!`
        : `${slogan} noite! 🌙\n\nFaltam *${l} dias* pra ${config.nome}.\n\n${numAulas} aulas ao vivo que podem mudar a forma como você se enxerga.\n\n👉 Já ativa os lembretes e deixa o like:\n\n${linksBlock()}\n\nReage com um 🔥 se você já está ansioso pra começar!`;

      const noiteHora = offset === -1 ? (config.hora_live || '20:00') : '20:00';
      msgs.push(textMsg(fn, day, setTime(dayDate, noiteHora), g1, noiteTxt,
        `Dia ${day} — Noite`, { link_preview: true }));
    }

    // ── Dias de aula ─────────────────────────────────────────────────────────
    for (let i = 1; i <= numAulas; i++) {
      const aulaDateStr  = aula(i)?.data || config.data_live;
      const aulaDateObj  = new Date(aulaDateStr + 'T12:00:00');
      const dayNum       = warmupDays + i;
      const aulaDateHora = setTime(aulaDateObj, aulaHora(i));

      // Manhã (8h)
      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '08:00'), g1,
        `${slogan} dia! ☀️\n\n*HOJE é o dia.*\n\nHoje às ${aulaH(i)} começa a Aula ${i} - *${aulaTit(i)}*.\n\n${profDupla} vão ao vivo conduzir essa experiência.\n\nSepara o caderno. Avisa a família. Hoje você tem um compromisso com você mesmo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🔥 se você vai estar lá HOJE!`,
        `${aulaTit(i)} — Manhã`, { link_preview: true }));

      // Tarde (14h) — enquete
      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '15:00'), g1,
        `${slogan} tarde! ☀️\n\nHoje às ${aulaH(i)} temos a Aula ${i} - *${aulaTit(i)}*! 🔴\n\n*Como você está chegando para a aula de hoje?*\n\nSeleciona a sua resposta 👇\n\nReage com um ✨ nessa mensagem!`,
        `${aulaTit(i)} — Enquete (intro)`));

      msgs.push(pollMsg(fn, dayNum,
        new Date(setTime(aulaDateObj, '15:00').getTime() + 3 * 60 * 1000),
        g1,
        'Como você está chegando para a aula de hoje?',
        ['Ansioso - mal posso esperar', 'Curioso - quero ver o que vai rolar', 'Reflexivo - já cheguei pensando', 'Pronto - bora viver isso ao vivo'],
        `${aulaTit(i)} — Enquete`));

      // Contagem regressiva (-3h, -2h, -1h)
      const countdowns: [number, string, string][] = [
        [-3,
          `⏰ *Faltam 3 HORAS pra Aula ${i} - ${aulaTit(i)}!*\n\nHoje às ${aulaH(i)}, ao vivo. Você não vai querer perder o início.\n\n👉 ${aulaLink(i)}\n\nReage com um ⏰!`,
          `${aulaTit(i)} — -3h`],
        [-2,
          `⏰ *Faltam 2 HORAS!*\n\nJá separa o caderno, o fone e um lugar tranquilo. Essa aula pede atenção total.\n\n👉 ${aulaLink(i)}\n\nReage com um 📝!`,
          `${aulaTit(i)} — -2h`],
        [-1,
          `⏰ *Falta 1 HORA pra começar!*\n\nDaqui a 60 minutos, ${profDupla} entram ao vivo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🚀 se já está se preparando!`,
          `${aulaTit(i)} — -1h`],
      ];

      for (const [offset, txt, label] of countdowns) {
        const t = new Date(aulaDateHora.getTime() + offset * 60 * 60 * 1000);
        msgs.push(textMsg(fn, dayNum, t, g1, txt, label,
          { link_preview: true, mention_everyone: offset === -1 }));
      }

      // AO VIVO
      msgs.push(textMsg(fn, dayNum, aulaDateHora, g1,
        `🔴 *ESTAMOS AO VIVO!*\n\nAula ${i} - *${aulaTit(i)}* - começou AGORA!\n\nCorre pra não perder o início 👇\n\n👉 ${aulaLink(i)}\n\nReage com um ❤️ e entra AGORA!`,
        `${aulaTit(i)} — AO VIVO`,
        { link_preview: true, mention_everyone: true }));

      // Provocações (+10, +20, +30, +40 min)
      const provocacoes: [number, string, string][] = [
        [10, `⚡ A aula já começou e a energia está absurda!\n\nSe você ainda não entrou, esse é o momento. Vem 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 1`],
        [20, `🧠 ${profAnchor} está ao vivo conduzindo pontos profundos agora.\n\nNão deixa pra depois - entra agora 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 2`],
        [30, `🌟 O ao vivo tem algo que o replay nunca vai te dar: a experiência de viver isso em tempo real.\n\nAinda dá tempo. Entra 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 3`],
        [40, `🎁 Atenção! Vai rolar *SORTEIO* pra quem está ao vivo!\n\nEntra agora e ainda dá tempo de participar 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 4`],
      ];

      for (const [min, txt, label] of provocacoes) {
        const t = new Date(aulaDateHora.getTime() + min * 60 * 1000);
        msgs.push(textMsg(fn, dayNum, t, g1, txt, label, { link_preview: true }));
      }
    }

    // ── Oferta pós-evento ─────────────────────────────────────────────────────
    const diaOferta    = addDays(firstClassDate, numAulas);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';
    const baseDay      = warmupDays + numAulas;

    msgs.push(textMsg(fn, baseDay + 1, setTime(diaOferta, '10:00'), g2,
      `Você acabou de passar por algo que a maioria das pessoas nunca vai ter acesso.\n\n${numAulas} aulas que foram fundo no que está por trás dos seus padrões.\n\nE agora você tem duas opções:\n\n1️⃣ Levar o que aprendeu e tentar aplicar sozinho — como já fez outras vezes.\n\n2️⃣ Continuar esse trabalho com estrutura, suporte e profundidade real.\n\nPara quem quer ir além, as matrículas abriram agora.\n\nSão vagas limitadas — e quem passou pelas aulas ao vivo tem prioridade.\n\n👉 ${linkCheckout}\n\nAs vagas não esperam.`,
      'Oferta — Abertura', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 2, setTime(addDays(diaOferta, 1), '19:00'), g2,
      `Ontem abriram as matrículas. E muita gente já garantiu a vaga.\n\nSe você ainda está pensando — entendo. Toda decisão real exige coragem.\n\nMas deixa eu te perguntar algo:\n\nO que vai ser diferente daqui a 6 meses se você continuar do jeito que está?\n\nOs mesmos padrões. Os mesmos ciclos. A mesma sensação de quase lá.\n\n👉 ${linkCheckout}\n\nVagas ainda disponíveis — mas não por muito tempo.`,
      'Oferta — Follow-up +1', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 3, setTime(addDays(diaOferta, 2), '18:00'), g2,
      `⚠️ *Amanhã encerram as matrículas.*\n\nSe você saiu das aulas sentindo que algo virou — o próximo passo está disponível agora.\n\nDepois de amanhã, não tem como garantir vaga.\n\n👉 ${linkCheckout}`,
      'Oferta — Escassez +2', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 4, setTime(addDays(diaOferta, 3), '12:00'), g2,
      `🔒 *Hoje é o último dia.*\n\nAs matrículas fecham à meia-noite.\n\nO momento certo não existe. Existe a decisão que você toma antes de estar completamente pronto.\n\nEssa decisão, tomada hoje, pode mudar o que vem depois.\n\n👉 ${linkCheckout}\n\nDepois da meia-noite, a porta fecha.`,
      'Oferta — Encerramento +3', { link_preview: true, mention_everyone: true }));

  // ═══════════════════════════════════════════════════════════════════════════
  // NPA — PRESENCIAL
  // ═══════════════════════════════════════════════════════════════════════════
  } else {
    const warmupDays  = 3;
    const warmupStart = addDays(new Date(config.data_live + 'T12:00:00'), -warmupDays);

    const npaLocal = aula(1)?.link || '{{endereco}}';
    const npaInfo  = `📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}*\n⏰ ${aulaH(1)}\n📍 ${npaLocal}`;

    const diasNpa = [
      {
        manhaTxt: `Você entrou.\n\nE isso já diz muito sobre você.\n\nA maioria das pessoas passa a vida convivendo com padrões que não quer — relacionamentos que se repetem, ansiedades que não passam, autossabotagem toda vez que estava quase chegando lá.\n\nSem nunca parar pra entender de onde isso vem.\n\nVocê escolheu fazer diferente.\n\nEm ${warmupDays} dias, você vai estar presencialmente em um encontro que foi desenhado para ir fundo — não em teoria, mas em experiência real.\n\nNão existe gravação. Não existe replay. O que vai acontecer nesse dia só vai existir para quem estiver lá.\n\n${npaInfo}\n\nFaltam *${warmupDays} dias*.\n\nReaja com ❤️ se você vai aparecer.`,
        tardeIntro: `Antes de começar, quero te conhecer melhor — responde com honestidade:`,
        pollNome: 'O que mais te trouxe até aqui?',
        pollOps: ['Cansaço de repetir os mesmos padrões', 'Relacionamentos que sempre decepcionam', 'Ansiedade que não me deixa em paz', 'Quero me entender de verdade'],
        noiteTxt: `A maior parte das coisas que nos travam não está no consciente.\n\nEstá no inconsciente — operando nos bastidores de cada decisão, reação e escolha que você faz.\n\nE enquanto ele não for acessado, você pode tentar mudar o quanto quiser. Os padrões voltam.\n\nNo nosso encontro presencial, vamos abrir esse acesso — com profundidade que só o ambiente ao vivo proporciona.\n\n${npaInfo}\n\nFaltam *${warmupDays} dias*. Separa o dia na agenda agora.`,
      },
      {
        manhaTxt: `Você já percebeu que certos padrões se repetem na sua vida — não importa o quanto você tente mudar?\n\nMuda o contexto. Muda a pessoa. Muda o emprego.\nMas a mesma sensação volta.\n\nIsso não é azar. É o inconsciente recriando o que aprendeu — na tentativa de te dar uma nova chance de resolver o que ficou irresolvido.\n\nSem entender esse mecanismo, você vai continuar preso nele.\n\nNo nosso encontro presencial, vamos desmontar esse ciclo juntos.\n\nE quem não estiver lá não vai ter acesso a esse conteúdo em nenhum outro lugar — não existe versão online, não existe gravação.\n\n${npaInfo}\n\nFaltam *2 dias*.\n\nReaja com 🔥 se você já se pegou repetindo um padrão que queria ter quebrado.`,
        tardeIntro: `A pergunta de hoje vai fundo — responde com sinceridade:`,
        pollNome: 'Qual situação da sua vida mais se repete de formas diferentes?',
        pollOps: ['Me saboto quando estou perto do que quero', 'Me envolvo com pessoas que me decepcionam', 'Fico preso(a) em ciclos de ansiedade e controle', 'Me cobro mais do que me aceito'],
        noiteTxt: `Duas perguntas para você levar pra dormir:\n\n*Por que você reage do jeito que reage?*\n*Por que você escolhe o que escolhe — mesmo quando sabe que vai doer?*\n\nEssas não são perguntas filosóficas. São as perguntas que, quando respondidas, mudam tudo.\n\nAmanhã damos o último passo antes do nosso encontro presencial.\n\n${npaInfo}\n\nFaltam *2 dias*. Confirma com alguém que você vai aparecer — isso aumenta em muito a chance de você realmente ir.`,
      },
      {
        manhaTxt: `Amanhã é o dia.\n\nVou ser direto:\n\nO que vai acontecer no nosso encontro presencial não é palestra. Não é aula expositiva. Não é conteúdo que você encontra em qualquer lugar.\n\nÉ uma experiência de contato real com o que está por baixo dos seus padrões — com dinâmicas, acolhimento e a profundidade que só o encontro presencial proporciona.\n\nE não existe gravação. Não existe "assisto depois". Não existe segunda chance para esse dia específico.\n\nQuem não aparecer amanhã simplesmente perde. E vai continuar onde estava.\n\n${npaInfo}\n\nFalta *1 dia*.\n\nReaja com 🔥 se você vai estar lá amanhã.`,
        tardeIntro: `Véspera do nosso encontro. Uma última pergunta:`,
        pollNome: 'Qual é a maior transformação que você quer sair desse encontro tendo iniciado?',
        pollOps: ['Parar de me sabotar e agir com mais coragem', 'Ter relacionamentos mais saudáveis e reais', 'Me libertar da ansiedade e do excesso de controle', 'Me aceitar mais e me cobrar menos'],
        noiteTxt: `Amanhã, às ${aulaH(1)}, é o nosso encontro.\n\nUma pergunta para você dormir pensando:\n\n*Se eu pudesse entender completamente o que me trava — o que mudaria na minha vida?*\n\nChega amanhã com essa pergunta. O que vai acontecer lá vai respondê-la.\n\nTrás caderno, caneta e disposição pra olhar pra dentro.\n\n${npaInfo}\n\nFalta *1 dia*. Não perca — não tem como recuperar o que acontece presencialmente.`,
      },
    ];

    for (let i = 0; i < warmupDays; i++) {
      const day     = i + 1;
      const dayDate = addDays(warmupStart, i);
      const d       = diasNpa[i];

      msgs.push(textMsg(fn, day, setTime(dayDate, '11:00'), g1,
        d.manhaTxt, `Dia ${day} — Manhã`, { link_preview: true }));
      msgs.push(textMsg(fn, day, setTime(dayDate, '17:00'), g1,
        d.tardeIntro + '\n\n👇', `Dia ${day} — Enquete (intro)`));
      msgs.push(pollMsg(fn, day,
        new Date(setTime(dayDate, '17:00').getTime() + 3 * 60 * 1000),
        g1, d.pollNome, d.pollOps, `Dia ${day} — Enquete`));
      msgs.push(textMsg(fn, day, setTime(dayDate, '23:00'), g1,
        d.noiteTxt, `Dia ${day} — Noite`, { link_preview: true }));
    }

    const aulaDateObj  = new Date(config.data_live + 'T12:00:00');
    const aulaDateHora = setTime(aulaDateObj, aulaHora(1));
    const dayNum       = warmupDays + 1;

    msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '08:00'), g1,
      `*HOJE É O DIA.*\n\nDaqui algumas horas você vai estar em um lugar que muito pouca gente tem coragem de ir — dentro de si mesmo, de verdade.\n\nO encontro começa às ${aulaH(1)}. Organize sua manhã com calma e chegue no horário — o início é parte da experiência.\n\nNão existe gravação. O que vai acontecer hoje existe só hoje, só para quem estiver lá.\n\nTrás caderno e caneta.\n\n${npaInfo}\n\nReage com ❤️ se você vai aparecer hoje.`,
      'Dia do Evento — Manhã', { link_preview: true }));

    msgs.push(textMsg(fn, dayNum,
      new Date(aulaDateHora.getTime() - 2 * 60 * 60 * 1000), g1,
      `⏰ *Faltam 2 horas para o ${aulaTit(1)}.*\n\nSe você ainda não saiu de casa — começa a se preparar agora.\n\nConsidere o trânsito. Chegue com antecedência. O início é fundamental — não adianta chegar na metade.\n\n📍 ${npaLocal}\n\nReage com 🔥 se você já está a caminho!`,
      'Dia do Evento — -2h', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum,
      new Date(aulaDateHora.getTime() - 30 * 60 * 1000), g1,
      `⏰ *Faltam 30 minutos.*\n\nSe você ainda não saiu — sai AGORA.\n\nChegar no horário faz parte do respeito com você mesmo e com quem já está lá.\n\n📍 ${npaLocal}`,
      'Dia do Evento — -30min', { mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, aulaDateHora, g1,
      `🔔 *O ${aulaTit(1).toUpperCase()} COMEÇOU.*\n\nQuem está aqui — bem-vindo. Isso exige coragem, e você veio.\n\nPara quem ainda está chegando: entra com respeito e sem interrupções.\n\nPara quem não pôde vir: isso fica para a próxima turma — não existe gravação.\n\n📍 ${npaLocal}`,
      'Dia do Evento — Início', { mention_everyone: true }));

    const diaOferta    = addDays(new Date(config.data_live + 'T12:00:00'), 1);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';

    msgs.push(textMsg(fn, dayNum + 1, setTime(diaOferta, '10:00'), g2,
      `Como você está depois de ontem?\n\nO que acontece em um encontro presencial como esse não cabe em palavra. Mas você sabe o que foi.\n\nAlguma coisa em você virou ontem. E agora você tem uma escolha:\n\nDeixa isso como uma boa experiência — ou usa isso como ponto de partida para uma transformação real.\n\nPara quem quer continuar esse trabalho com estrutura, profundidade e acompanhamento:\n\nAs matrículas estão abertas. São vagas limitadas e quem esteve no evento tem prioridade.\n\n👉 ${linkCheckout}\n\nNão existe o momento perfeito. Existe a decisão que você toma antes de estar completamente pronto.`,
      'Oferta Pós-NPA', { link_preview: true, mention_everyone: true }));
  }

  return msgs.map(m => ({ ...m, status: m.hasUnresolvedVar ? 'draft' : 'scheduled' }));
}

// ─── Helpers para o wizard ────────────────────────────────────────────────────

export function buildFunnelVariaveis(config: WizardConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  config.grupos.forEach((g, i) => {
    if (g.jid)  vars[`grupo_${i + 1}`]     = g.jid;
    if (g.link) vars[`link_grupo_${i + 1}`] = g.link;
  });

  if (config.tipo === 'npa') {
    if (config.grupos[0]?.jid)  vars['grupo_manha']       = config.grupos[0].jid;
    if (config.grupos[0]?.link) vars['link_grupo_manha']  = config.grupos[0].link;
    if (config.grupos[1]?.jid)  vars['grupo_tarde']       = config.grupos[1].jid;
    if (config.grupos[1]?.link) vars['link_grupo_tarde']  = config.grupos[1].link;
    if (config.bv_wpp_mensagem)       vars['bv_wpp_manha'] = config.bv_wpp_mensagem;
    if (config.bv_wpp_mensagem_tarde) vars['bv_wpp_tarde'] = config.bv_wpp_mensagem_tarde;
  }

  config.aulas.forEach((a, i) => {
    const n = i + 1;
    if (a.titulo)    vars[`titulo_aula_${n}`] = a.titulo;
    if (a.data) {
      const [, mo, dy] = a.data.split('-');
      vars[`data_aula_${n}`] = `${dy}/${mo}`;
    }
    if (a.hora)      vars[`hora_aula_${n}`]   = a.hora;
    if (a.link)      vars[`link_aula_${n}`]   = a.link;
    if (a.professor) vars[`professor_${n}`]   = a.professor;
  });

  config.links_extras.forEach(({ key, value }) => {
    if (key && value) vars[key] = value;
  });

  return vars;
}

export function defaultBoasVindasWpp(config: WizardConfig): string {
  const g1 = config.grupos[0]?.link || config.grupos[0]?.jid || '{{link_grupo}}';
  return `Olá {{nome}}! 🎉\n\nSeja muito bem-vindo(a) ao ${config.nome}!\n\nAcesse o grupo exclusivo:\n${g1}\n\nNos vemos lá! 🚀`;
}

export function defaultBoasVindasNpaManha(config: WizardConfig): string {
  const link = config.grupos[0]?.link || '{{link_grupo_manha}}';
  return `🌟 Bem-vindo(a) ao *${config.nome || '{{evento_nome}}'}* — Turma Manhã!\n\nSua inscrição está confirmada! 🙌\n\n📅 Data: {{data_evento}}\n⏰ Turma: Manhã ☀️\n\n🚨 IMPORTANTE — entre agora no grupo dos alunos:\n👉 ${link}\n\nNo grupo você vai receber:\n🔹 Avisos do dia\n🔹 Materiais complementares\n🔹 Bônus surpresa 🎁\n\nQualquer dúvida, é só me chamar!`;
}

export function defaultBoasVindasNpaTarde(config: WizardConfig): string {
  const link = config.grupos[1]?.link || '{{link_grupo_tarde}}';
  return `🌟 Bem-vindo(a) ao *${config.nome || '{{evento_nome}}'}* — Turma Tarde!\n\nSua inscrição está confirmada! 🙌\n\n📅 Data: {{data_evento}}\n⏰ Turma: Tarde 🌆\n\n🚨 IMPORTANTE — entre agora no grupo dos alunos:\n👉 ${link}\n\nNo grupo você vai receber:\n🔹 Avisos do dia\n🔹 Materiais complementares\n🔹 Bônus surpresa 🎁\n\nQualquer dúvida, é só me chamar!`;
}

export function defaultPixTemplate(): string {
  return `Olá {{nome}}! 👋\n\nSeu PIX para o ingresso do *{{evento_nome}}* foi gerado com sucesso.\n\n✔ Pagamento 100% seguro\n✔ Ingresso liberado automaticamente após confirmação\n✔ Você receberá aqui o link do grupo exclusivo\n\nCopie o código PIX logo abaixo e cole no seu banco:\n\nEstamos quase lá! ✨`;
}

export function defaultBoasVindasEmail(config: WizardConfig): { assunto: string; corpo: string } {
  return {
    assunto: `Bem-vindo(a) ao ${config.nome}! 🎉`,
    corpo: `<h2>Olá, {{nome}}!</h2>
<p>Estamos felizes em ter você no <strong>${config.nome}</strong>.</p>
<p>Acesse o grupo e fique por dentro de tudo:</p>
<p><a href="${config.grupos[0]?.jid || '{{link_grupo}}'}" style="background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Entrar no Grupo</a></p>
<p>Qualquer dúvida, estamos à disposição!</p>`,
  };
}
