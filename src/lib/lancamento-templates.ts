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
  hora_fim?: string; // 'HH:MM' — usado nas sessões do NPA (manhã/tarde)
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
  templateId?: string; // funil_templates.id — vazio/undefined = usa o texto padrão embutido
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

export interface FunilTemplateEnquete { intro: string; nome: string; opcoes: string[]; }

/**
 * Conteúdo de um template de aquecimento (tabela `funil_templates`) — só as
 * SOBRESCRITAS. Campo vazio/ausente cai no texto padrão embutido no gerador
 * abaixo; não precisa preencher tudo pra ter um template válido.
 *
 * Escopo é só a fase de AQUECIMENTO (antes do evento) — mensagens de dia de
 * aula, contagem regressiva e oferta continuam fixas, por pedido do dono
 * ("templates de mensagens que usamos pra aquecer o grupo").
 */
export interface FunilTemplateConteudo {
  // Lançamento (dias 1-9)
  manhas?: Partial<Record<number, string>>;
  enquetes?: Partial<Record<number, FunilTemplateEnquete>>; // chaves 2,3,5,6,8,9
  audio_texto?: string;         // dias 1,4,7 (tarde)
  noite_texto?: string;         // dias que não são véspera
  noite_vespera_texto?: string; // dia -1 (véspera da aula 1)

  // NPA (dias 1-10)
  temas_manha?: Partial<Record<number, string>>;
  temas_noite?: Partial<Record<number, string>>;
  // enquetes do NPA reaproveita o mesmo campo `enquetes` acima (chaves 1,3,5,7,9)
}

/** Substituição simples de {{chave}} — chave sem valor no dicionário fica como está. */
export function aplicarVariaveis(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
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

export function generateLancamentoMessages(config: WizardConfig, template?: FunilTemplateConteudo | null): TemplateMensagem[] {
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
  const slogan = config.slogan || 'Excelente';

  // ═══════════════════════════════════════════════════════════════════════════
  // LANÇAMENTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (config.tipo === 'lancamento') {

    const profAnchor = config.aulas[0]?.professor?.trim() || '';
    const profConv   = config.professor_convidado?.trim() || '';
    const hasProfessor = !!profAnchor;
    const profDupla  = profConv ? `${profAnchor} e ${profConv}` : profAnchor;
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

    // Variáveis pra quem escreve um template de aquecimento customizado — os textos
    // padrão abaixo continuam com o texto literal (não usam {{}}); isso é só pra
    // quem sobrescrever no editor de templates poder referenciar dado dinâmico.
    const varsBase: Record<string, string> = {
      slogan,
      class_hora: classHora,
      aula_link_1: aulaLink(1),
      aula_titulo_1: aulaTit(1),
      aula_data_1: aulaData(1),
      dates_block: datesBlock(),
      links_block: linksBlock(),
      num_aulas: String(numAulas),
      nome_lancamento: config.nome,
      professor_do_texto: hasProfessor ? ` do Prof. ${profAnchor}` : '',
      com_professor_linha: hasProfessor ? `\nCom ${profDupla}.` : '',
      professor_conduz_linha: hasProfessor
        ? (profConv ? `${profAnchor} conduz essa jornada com participação de ${profConv}.\n\n` : `${profAnchor} conduz essa jornada.\n\n`)
        : '',
    };

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

Sempre às *${classHora}*, ao vivo no YouTube.${hasProfessor ? `\nCom ${profDupla}.` : ''}

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

${hasProfessor ? `${profConv ? `${profAnchor} conduz essa jornada com participação de ${profConv}.` : `${profAnchor} conduz essa jornada.`}\n\n` : ''}👉 Ativa o lembrete e deixa o like — começa amanhã:
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
      const varsDia = { ...varsBase, dias_restantes: String(l) };

      // Manhã — reflexão única de psicanálise por dia (ou a sobrescrita do template)
      const manhaOverride = template?.manhas?.[day];
      const manhaTexto = manhaOverride ? aplicarVariaveis(manhaOverride, varsDia) : manhasMsgs[day];
      msgs.push(textMsg(fn, day, setTime(dayDate, '08:00'), g1, manhaTexto,
        `Dia ${day} — Manhã`, { link_preview: true }));

      // Tarde: a cada 3 dias sugere áudio (dias 1,4,7 do warmup), outros dias enquete única
      if (l % 3 === 0) {
        const audioOverride = template?.audio_texto;
        const audioTxt = audioOverride
          ? aplicarVariaveis(audioOverride, varsDia)
          : `${slogan} tarde! ☀️\n\n🎙️ *Áudio sugerido${hasProfessor ? ` do Prof. ${profAnchor}` : ''}:*\n\n"${slogan}, pessoal! Estamos chegando muito perto da nossa primeira aula. Quero te encontrar ao vivo no dia ${aulaData(1)}, às ${classHora}, para abrir essa jornada com profundidade e direção."\n\n👉 ${aulaLink(1)}\n\nReage com um ❤️ depois de ouvir!`;
        msgs.push(textMsg(fn, day, setTime(dayDate, '15:00'), g1, audioTxt,
          `Dia ${day} — Tarde (Áudio)`, { subtipo: 'audio' }));
      } else {
        const eqOverride = template?.enquetes?.[day];
        const eq = eqOverride
          ? { intro: aplicarVariaveis(eqOverride.intro, varsDia), nome: eqOverride.nome, opcoes: eqOverride.opcoes }
          : enquetesDias[day];
        msgs.push(textMsg(fn, day, setTime(dayDate, '15:00'), g1, eq.intro,
          `Dia ${day} — Enquete (intro)`));
        msgs.push(pollMsg(fn, day,
          new Date(setTime(dayDate, '15:00').getTime() + 3 * 60 * 1000),
          g1, eq.nome, eq.opcoes,
          `Dia ${day} — Enquete`));
      }

      // Noite
      const noiteOverride = offset === -1 ? template?.noite_vespera_texto : template?.noite_texto;
      const noiteTxt = noiteOverride
        ? aplicarVariaveis(noiteOverride, varsDia)
        : offset === -1
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
        `${slogan} dia! ☀️\n\n*HOJE é o dia.*\n\nHoje às ${aulaH(i)} começa a Aula ${i} - *${aulaTit(i)}*.\n\n${hasProfessor ? `${profDupla} ${profConv ? 'vão' : 'vai'} ao vivo conduzir essa experiência.\n\n` : ''}Separa o caderno. Avisa a família. Hoje você tem um compromisso com você mesmo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🔥 se você vai estar lá HOJE!`,
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
          `⏰ *Falta 1 HORA pra começar!*\n\nDaqui a 60 minutos, ${hasProfessor ? `${profDupla} ${profConv ? 'entram' : 'entra'}` : 'a aula entra'} ao vivo.\n\n👉 ${aulaLink(i)}\n\nReage com um 🚀 se já está se preparando!`,
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
        [20, `🧠 ${hasProfessor ? `${profAnchor} está ao vivo conduzindo pontos profundos agora` : 'A aula está ao vivo com pontos profundos sendo conduzidos agora'}.\n\nNão deixa pra depois - entra agora 👇\n👉 ${aulaLink(i)}`, `${aulaTit(i)} — Provocação 2`],
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
  // NPA — PRESENCIAL (10 dias de expectativa, 2 grupos escalonados, 2 sessões
  // no dia do evento — manhã e tarde — e oferta pós-evento em 3 níveis)
  // ═══════════════════════════════════════════════════════════════════════════
  } else {
    const warmupDays  = 10;
    const warmupStart = addDays(new Date(config.data_live + 'T12:00:00'), -warmupDays);
    const STAGGER_MS  = 5 * 60 * 1000; // intervalo grupo 1 → grupo 2 (anti-ban)

    const manhaSessao  = aula(1);
    const tardeSessao  = aula(2);
    const npaLocal     = manhaSessao?.link || '{{endereco}}';
    const manhaHoraIni = manhaSessao?.hora || '09:00';
    const manhaHoraFim = manhaSessao?.hora_fim || '13:00';
    const tardeHoraIni = tardeSessao?.hora || '14:00';
    const tardeHoraFim = tardeSessao?.hora_fim || '18:00';
    const nomeEvento   = config.nome || '{{evento_nome}}';
    const temGrupo2    = g2 !== g1;

    const varsBase: Record<string, string> = {
      slogan,
      nome_evento: nomeEvento,
      npa_local: npaLocal,
      manha_hora_ini: manhaHoraIni,
      manha_hora_fim: manhaHoraFim,
      tarde_hora_ini: tardeHoraIni,
      tarde_hora_fim: tardeHoraFim,
      aula_data_1: aulaData(1),
    };

    // Envia o mesmo texto pros 2 grupos (grupo 2 sempre STAGGER_MS depois do grupo 1)
    function pushEscalonado(day: number, at: Date, text: string, labelBase: string, opts: Partial<TemplateMensagem> = {}) {
      msgs.push(textMsg(fn, day, at, g1, text, `${labelBase} (Grupo 1)`, opts));
      if (temGrupo2) {
        msgs.push(textMsg(fn, day, new Date(at.getTime() + STAGGER_MS), g2, text, `${labelBase} (Grupo 2)`, opts));
      }
    }

    // ── 10 temas únicos de expectativa — nunca repete, nunca ensina de fato,
    //    só planta curiosidade genuína pro encontro presencial ──────────────
    // Endereço só entra a partir de "faltam 5 dias" (dia 6), por orientação de
    // manter o clima de mistério do evento high-ticket antes disso.
    const temasManha: string[] = [
      // Dia 1 — faltam 10 — O código
      `${slogan} dia! ☀️\n\nExiste um código que você carrega desde o dia em que nasceu.\n\nNão é astrologia. Não é sorte. É matemática — a mesma que Pitágoras usava pra decifrar padrões no universo, aplicada a você.\n\nSeu nome. Sua data. As escolhas que se repetem. Tudo isso tem uma lógica numérica por trás — e a maioria das pessoas nunca chega perto de enxergar essa lógica.\n\nNos próximos dias, vamos te dar alguns sinais dela. Só sinais.\n\nA leitura completa é outra coisa — e ela vai acontecer ao vivo, presencialmente, em *${nomeEvento}*.\n\nReage com 🔢 se você está curioso(a).`,

      // Dia 2 — faltam 9 — Caminho de Vida
      `${slogan} dia! ☀️\n\nExiste um único número, calculado a partir da sua data de nascimento, que descreve o motivo real de você estar aqui.\n\nChama-se Número do Caminho de Vida.\n\nQuando alguém entende o próprio Caminho de Vida, coisas que pareciam sem explicação — escolhas erradas, portas que insistiam em fechar, direções que nunca faziam sentido — começam a se encaixar.\n\nO seu já está calculado. Só falta você ouvir o que ele diz.\n\nReage com 🧭 se você quer descobrir o seu.`,

      // Dia 3 — faltam 8 — Nome
      `${slogan} dia! ☀️\n\nSeu nome não foi escolhido por acaso — mesmo que quem escolheu não soubesse disso.\n\nCada letra carrega um valor numérico. E a soma dessas letras revela algo que você projeta no mundo o tempo todo, sem perceber.\n\nTem gente que carrega um nome que combina perfeitamente com quem é. E tem gente carregando um nome que puxa pra outra direção — gerando um atrito silencioso que dura a vida inteira.\n\nQual dos dois é o seu caso? Isso só a leitura completa revela.\n\nReage com ✨ se isso mexeu com você.`,

      // Dia 4 — faltam 7 — Ciclos de 9 anos
      `${slogan} dia! ☀️\n\nVocê já teve um ano que pareceu simplesmente impossível — e um outro em que tudo fluiu sem esforço?\n\nIsso não foi coincidência.\n\nExiste um ciclo de 9 anos que rege a vida de cada pessoa — e cada ano dentro dele tem uma vibração própria, com desafios e potenciais específicos.\n\nQuando você sabe em qual ano do ciclo está, para de nadar contra a maré e começa a usar a correnteza a seu favor.\n\nReage com 🌊 se você já sentiu isso na pele.`,

      // Dia 5 — faltam 6 — Números Mestres
      `${slogan} dia! ☀️\n\nExistem três números que a Numerologia Pitagórica trata como raros: 11, 22 e 33.\n\nChamam-se Números Mestres. Quem carrega um deles sente isso a vida inteira — uma intensidade maior, uma sensibilidade fora da curva, uma cobrança interna que os outros não entendem.\n\nÉ um dom. Mas é também um peso, se ninguém nunca te explicou o que ele significa.\n\nReage com 🔮 se você suspeita que pode carregar um.`,

      // Dia 6 — faltam 5 — Dívidas cármicas (a partir daqui já pode citar local)
      `${slogan} dia! ☀️\n\nTem gente que vive tropeçando no mesmo tipo de problema — trocam as pessoas, trocam o emprego, trocam a cidade, e o padrão continua idêntico.\n\nNa Numerologia Pitagórica, isso pode ter nome: dívida cármica. Um número que carrega uma lição não resolvida, repetindo-se até ser encarada de frente.\n\nNão é castigo. É um convite pra parar de repetir e começar a resolver.\n\n📍 *${nomeEvento}* — ${npaLocal}\n\nReage com 🔁 se você reconhece um padrão que insiste em voltar.`,

      // Dia 7 — faltam 4 — Compatibilidade
      `${slogan} dia! ☀️\n\nVocê já esteve perto de alguém e sentiu uma sintonia que não conseguia explicar? Ou o oposto — um desconforto instantâneo, sem motivo aparente?\n\nA vibração numérica de duas pessoas se encontra do mesmo jeito que duas notas musicais — ou formam harmonia, ou formam dissonância.\n\nIsso não decide um relacionamento. Mas explica muito do que você já viveu.\n\n📍 *${nomeEvento}* — ${npaLocal}\n\nReage com 💫 se já sentiu essa sintonia (ou dissonância) instantânea com alguém.`,

      // Dia 8 — faltam 3 — Dia de nascimento (hoje também tem enquete de presença, mensagem separada)
      `${slogan} dia! ☀️\n\nAlém do Caminho de Vida, existe um segundo número — mais simples, mais direto — calculado só a partir do DIA em que você nasceu.\n\nEle aponta um talento natural. Uma habilidade que você já tem, mas que provavelmente nunca valorizou por achar "óbvia demais".\n\nFaltam 3 dias. E precisamos confirmar uma coisa com você — olha a próxima mensagem 👇`,

      // Dia 9 — faltam 2 — Transformação real
      `${slogan} dia! ☀️\n\nFaltam 2 dias.\n\nO que muda quando uma pessoa aprende a ler os próprios números não é uma sensação passageira de "aula legal".\n\nÉ decisão tomada com mais clareza. É parar de se culpar por ciclos difíceis. É entender, finalmente, por que certas coisas sempre custaram mais caro pra você do que pareciam custar pros outros.\n\nIsso não é teoria. É estrutura — e você vai sair de lá com a sua.\n\n📍 *${nomeEvento}* — ${npaLocal}\n\nReage com 🔥 se você já sabe que vai estar lá.`,

      // Dia 10 — véspera — urgência + logística
      `${slogan} dia! ☀️\n\n*Amanhã é o dia.*\n\nDez dias de sinais, perguntas e pequenas provocações — e amanhã tudo isso ganha nome, número e direção.\n\nEssa não é uma aula que fica gravada. É um encontro presencial, ao vivo, uma vez só.\n\n📅 *${nomeEvento}*\n📍 ${npaLocal}\n🕐 Manhã: ${manhaHoraIni} às ${manhaHoraFim} | Tarde: ${tardeHoraIni} às ${tardeHoraFim}\n\nTraga caderno e caneta. Chegue com alguns minutos de antecedência.\n\nReage com 🙌 se amanhã é o seu dia.`,
    ];

    // ── Contagem regressiva da noite — tom muda conforme o dia se aproxima ──
    const temasNoite: string[] = [
      `🌙 Boa noite!\n\nFaltam *10 dias* para *${nomeEvento}*.\n\nA contagem começou — e cada dia dessas mensagens vai revelar um pedacinho de algo maior.\n\nSe você chegou até aqui, alguma parte de você já sabe que vale a pena estar lá.`,
      `🌙 Boa noite!\n\nFaltam *9 dias*.\n\nEnquanto você lê essa mensagem, seus números já estão contando uma história — só falta você ouvir de perto.`,
      `🌙 Boa noite!\n\nFaltam *8 dias* para *${nomeEvento}*.\n\nEssa semana passa rápido. Guarda o compromisso com você mesmo.`,
      `🌙 Boa noite!\n\nFaltam *7 dias*.\n\nUma semana. É o tempo que separa você de uma leitura que muita gente nunca teve coragem de fazer.`,
      `🌙 Boa noite!\n\nFaltam *6 dias* para *${nomeEvento}*.\n\nA cada mensagem que você lê nessa semana, um número diferente da sua vida está sendo mencionado. Em breve, todos eles se juntam.`,
      `🌙 Boa noite!\n\nFaltam *5 dias*.\n\n📍 ${npaLocal}\n\nJá reserva esse dia — de verdade, na agenda.`,
      `🌙 Boa noite!\n\nFaltam *4 dias* para *${nomeEvento}*.\n\nQuem já decidiu que vai — reage com 🙋.`,
      `🌙 Boa noite!\n\nFaltam *3 dias*.\n\nSe você ainda não respondeu a enquete de hoje, responde agora — ela importa pra gente organizar tudo direitinho.`,
      `🌙 Boa noite!\n\nFaltam *2 dias* para *${nomeEvento}*.\n\nA ansiedade boa já começou pra quem vai estar lá.`,
      `🌙 Boa noite!\n\n*Amanhã é o dia.*\n\n📍 ${npaLocal}\n🕐 Manhã: ${manhaHoraIni} às ${manhaHoraFim} | Tarde: ${tardeHoraIni} às ${tardeHoraFim}\n\nDurma bem. Amanhã é um dia diferente.`,
    ];

    // ── Enquetes temáticas intercaladas em alguns dias (além da confirmação de
    //    presença no dia 8) — ligadas ao assunto do teaser daquele dia ──────
    const enquetesDias: Record<number, { intro: string; nome: string; opcoes: string[] }> = {
      1: {
        intro: `${slogan}! 👋\n\nAntes de seguir, uma pergunta rápida 👇`,
        nome: 'Qual é a sua relação atual com Numerologia?',
        opcoes: ['Nunca ouvi falar — quero descobrir', 'Conheço um pouco — quero aprofundar', 'Já estudei — quero aplicar de verdade', 'Sou cético(a) — mas estou aqui'],
      },
      3: {
        intro: `${slogan}! 👋\n\nUma pergunta rápida sobre o que você acabou de ler 👇`,
        nome: 'Você sente que seu nome combina com quem você é?',
        opcoes: ['Sim, sinto que combina perfeitamente', 'Não muito — sinto um estranhamento', 'Nunca parei pra pensar nisso', 'Quero descobrir com a leitura completa'],
      },
      5: {
        intro: `${slogan}! 👋\n\nUma pergunta direta 👇`,
        nome: 'Você já sentiu uma intensidade ou sensibilidade que os outros não pareciam entender?',
        opcoes: ['Sim, a vida inteira', 'Às vezes, em fases específicas', 'Não muito', 'Quero descobrir se carrego um Número Mestre'],
      },
      7: {
        intro: `${slogan}! 👋\n\nEnquete rápida 👇`,
        nome: 'Você já sentiu uma sintonia instantânea (ou o oposto) com alguém, sem explicação?',
        opcoes: ['Sim, sintonia forte logo de cara', 'Sim, mas foi estranhamento/desconforto', 'Já vivi os dois', 'Nunca reparei nisso'],
      },
      9: {
        intro: `${slogan}! 👋\n\nÚltima pergunta antes do grande dia 👇`,
        nome: 'Qual é a maior transformação que você quer carregar do encontro?',
        opcoes: ['Parar de me sabotar', 'Entender por que repito os mesmos padrões', 'Ter mais clareza sobre minhas decisões', 'Só estar presente e ver no que dá'],
      },
    };

    // Envia intro + enquete pros 2 grupos (grupo 2 sempre STAGGER_MS depois do grupo 1)
    function pushEnquete(day: number, at: Date, intro: string, nome: string, opcoes: string[], labelBase: string) {
      msgs.push(textMsg(fn, day, at, g1, intro, `${labelBase} (intro, Grupo 1)`));
      msgs.push(pollMsg(fn, day, new Date(at.getTime() + 3 * 60 * 1000), g1, nome, opcoes, `${labelBase} (Grupo 1)`));
      if (temGrupo2) {
        const at2 = new Date(at.getTime() + STAGGER_MS);
        msgs.push(textMsg(fn, day, at2, g2, intro, `${labelBase} (intro, Grupo 2)`));
        msgs.push(pollMsg(fn, day, new Date(at2.getTime() + 3 * 60 * 1000), g2, nome, opcoes, `${labelBase} (Grupo 2)`));
      }
    }

    for (let i = 0; i < warmupDays; i++) {
      const day     = i + 1;
      const dayDate = addDays(warmupStart, i);

      const manhaOverride = template?.temas_manha?.[day];
      const manhaTexto = manhaOverride ? aplicarVariaveis(manhaOverride, varsBase) : temasManha[i];
      pushEscalonado(day, setTime(dayDate, '08:00'), manhaTexto, `Dia ${day} — Manhã`);

      // Dia 8 (faltam 3) — enquete de confirmação de presença, além do teaser da manhã
      if (day === warmupDays - 2) {
        pushEnquete(day, setTime(dayDate, '11:00'),
          `${slogan}! 👋\n\nAntes de continuar — precisamos saber quem vai estar com a gente.\n\nResponde rapidinho 👇`,
          `Você confirma sua presença em ${nomeEvento} (${aulaData(1)})?`,
          ['Sim, confirmado! 🙌', 'Ainda não sei', 'Não vou conseguir ir'],
          `Dia ${day} — Enquete Presença`);
      } else {
        const eqOverride = template?.enquetes?.[day];
        const e = eqOverride
          ? { intro: aplicarVariaveis(eqOverride.intro, varsBase), nome: eqOverride.nome, opcoes: eqOverride.opcoes }
          : enquetesDias[day];
        if (e) pushEnquete(day, setTime(dayDate, '11:00'), e.intro, e.nome, e.opcoes, `Dia ${day} — Enquete`);
      }

      const noiteOverride = template?.temas_noite?.[day];
      const noiteTexto = noiteOverride ? aplicarVariaveis(noiteOverride, varsBase) : temasNoite[i];
      pushEscalonado(day, setTime(dayDate, '20:00'), noiteTexto, `Dia ${day} — Noite`);
    }

    // ── Dia do evento — 2 sessões (manhã e tarde), cada grupo com seus horários ──
    const eventDateObj = new Date(config.data_live + 'T12:00:00');
    const dayNum        = warmupDays + 1;
    const manhaHora     = setTime(eventDateObj, manhaHoraIni);
    const tardeHora     = setTime(eventDateObj, tardeHoraIni);

    msgs.push(textMsg(fn, dayNum, setTime(eventDateObj, '07:05'), g1,
      `*HOJE É O DIA.*\n\nDez dias de sinais — e agora eles ganham nome e número, ao vivo, com você presente.\n\n🕐 Sua sessão é de manhã: ${manhaHoraIni} às ${manhaHoraFim}.\n\nOrganize sua manhã com calma e chegue com antecedência — o início é parte da experiência.\n\nNão existe gravação. O que vai acontecer hoje existe só hoje, só pra quem estiver lá.\n\nTraga caderno e caneta.\n\n📍 ${npaLocal}\n\nReage com ❤️ se você vai aparecer hoje.`,
      'Dia do Evento — Manhã (Grupo 1)', { mention_everyone: true }));

    if (temGrupo2) {
      msgs.push(textMsg(fn, dayNum, new Date(setTime(eventDateObj, '07:05').getTime() + STAGGER_MS), g2,
        `*HOJE É O DIA.*\n\nDez dias de sinais — e agora eles ganham nome e número, ao vivo, com você presente.\n\n🕐 Sua sessão é de tarde: ${tardeHoraIni} às ${tardeHoraFim}.\n\nOrganize seu dia com calma e chegue com antecedência — o início é parte da experiência.\n\nNão existe gravação. O que vai acontecer hoje existe só hoje, só pra quem estiver lá.\n\nTraga caderno e caneta.\n\n📍 ${npaLocal}\n\nReage com ❤️ se você vai aparecer hoje.`,
        'Dia do Evento — Manhã (Grupo 2)', { mention_everyone: true }));
    }

    // Sessão da manhã → só grupo 1
    msgs.push(textMsg(fn, dayNum, new Date(manhaHora.getTime() - 2 * 60 * 60 * 1000), g1,
      `⏰ *Faltam 2 horas para a sua sessão.*\n\nSe você ainda não saiu de casa — começa a se preparar agora.\n\nConsidere o trânsito. Chegue com antecedência.\n\n📍 ${npaLocal}\n\nReage com 🔥 se você já está a caminho!`,
      'Dia do Evento — Manhã -2h', { mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, new Date(manhaHora.getTime() - 30 * 60 * 1000), g1,
      `⏰ *Faltam 30 minutos.*\n\nSe você ainda não saiu — sai AGORA.\n\n📍 ${npaLocal}`,
      'Dia do Evento — Manhã -30min', { mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, manhaHora, g1,
      `🔔 *COMEÇOU.*\n\nQuem está aqui — bem-vindo. Isso exige coragem, e você veio.\n\nPara quem ainda está chegando: entra com respeito e sem interrupções.\n\nPara quem não pôde vir: isso fica pra próxima turma — não existe gravação.\n\n📍 ${npaLocal}`,
      'Dia do Evento — Manhã Início', { mention_everyone: true }));

    // Sessão da tarde → só grupo 2 (se existir; senão cai no mesmo grupo 1)
    const gTarde = temGrupo2 ? g2 : g1;
    msgs.push(textMsg(fn, dayNum, new Date(tardeHora.getTime() - 2 * 60 * 60 * 1000), gTarde,
      `⏰ *Faltam 2 horas para a sua sessão.*\n\nSe você ainda não saiu de casa — começa a se preparar agora.\n\nConsidere o trânsito. Chegue com antecedência.\n\n📍 ${npaLocal}\n\nReage com 🔥 se você já está a caminho!`,
      'Dia do Evento — Tarde -2h', { mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, new Date(tardeHora.getTime() - 30 * 60 * 1000), gTarde,
      `⏰ *Faltam 30 minutos.*\n\nSe você ainda não saiu — sai AGORA.\n\n📍 ${npaLocal}`,
      'Dia do Evento — Tarde -30min', { mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, tardeHora, gTarde,
      `🔔 *COMEÇOU.*\n\nQuem está aqui — bem-vindo. Isso exige coragem, e você veio.\n\nPara quem ainda está chegando: entra com respeito e sem interrupções.\n\nPara quem não pôde vir: isso fica pra próxima turma — não existe gravação.\n\n📍 ${npaLocal}`,
      'Dia do Evento — Tarde Início', { mention_everyone: true }));

    // ── Oferta pós-evento — 3 níveis, mensagens separadas, sem link (só "chama aqui") ──
    const tier1Preco = config.links_extras.find(l => l.key === 'oferta_ebook_preco')?.value || '21';
    const tier2Preco = config.links_extras.find(l => l.key === 'oferta_mapa_preco')?.value || '47';
    const tier3Preco = config.links_extras.find(l => l.key === 'oferta_mentoria_preco')?.value || '397';

    const ofertaTier1 = `Hoje você viveu, ao vivo, uma introdução real ao seu próprio código numérico.\n\nMas o que rolou na sala não precisa ficar só na memória.\n\nPreparamos as *telas completas da aula de hoje* + um *eBook exclusivo* de Numerologia Pitagórica, pra você revisitar (e aplicar) tudo com calma, no seu tempo.\n\n📕 Telas da aula + eBook — por *R$ ${tier1Preco}*\n\nÉ o primeiro passo pra levar isso a sério. Chama aqui pra garantir o seu.`;
    const ofertaTier2 = `Ontem você teve um gostinho. Hoje a pergunta é: você quer o mapa inteiro?\n\nO *Mapa Numerológico Completo* é a sua leitura pessoal e detalhada — Caminho de Vida, Número do Nome, Ano Pessoal, Números Mestres (se você tiver) — tudo calculado especificamente pra você, num material que é seu pra sempre.\n\n🗺️ Mapa Numerológico Completo — por *R$ ${tier2Preco}*\n\nNão é o genérico que você viveu em grupo. É o seu, individual, com profundidade.`;
    const ofertaTier3 = `Última mensagem sobre isso.\n\nSe o que você viveu nesses dias abriu uma porta que você não quer fechar de novo — existe um caminho pra ir além da leitura pontual.\n\nA *Mentoria NPA* é o acompanhamento pra quem quer aplicar a Numerologia Pitagórica na prática, com direção, estrutura e suporte contínuo.\n\n🎓 Mentoria NPA — por *R$ ${tier3Preco}*\n\nVagas limitadas. Prioridade pra quem esteve com a gente no presencial.\n\nChama aqui se você sente que é a hora de ir além.`;

    const diaOfertaTier2e3 = addDays(eventDateObj, 1);

    pushEscalonado(dayNum, setTime(eventDateObj, '19:00'), ofertaTier1, 'Oferta — eBook + Telas (R$' + tier1Preco + ')', { mention_everyone: true });
    pushEscalonado(dayNum + 1, setTime(diaOfertaTier2e3, '10:00'), ofertaTier2, 'Oferta — Mapa Completo (R$' + tier2Preco + ')', { mention_everyone: true });
    pushEscalonado(dayNum + 1, setTime(diaOfertaTier2e3, '19:00'), ofertaTier3, 'Oferta — Mentoria NPA (R$' + tier3Preco + ')', { mention_everyone: true });
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
    if (a.titulo)    vars[`titulo_aula_${n}`]     = a.titulo;
    if (a.data) {
      const [, mo, dy] = a.data.split('-');
      vars[`data_aula_${n}`]     = `${dy}/${mo}`;
      vars[`data_aula_iso_${n}`] = a.data; // data completa para restaurar no wizard
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
