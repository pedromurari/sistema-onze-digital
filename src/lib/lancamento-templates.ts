/**
 * lancamento-templates.ts
 * Gera sequência padrão de mensagens para um lançamento ou NPA.
 *
 * Padrão por dia (aquecimento):
 *   11h  — Manhã: conteúdo + datas das aulas + CTA com links
 *   17h  — Tarde: introdução para enquete
 *   17h03 — Tarde: enquete (poll)
 *   23h  — Noite: contagem regressiva + datas + CTA com links
 *
 * Dias de aula: mensagens intensivas de convocação + ao vivo
 */

export interface AulaConfig {
  titulo?: string;   // ex: "O Despertar" — opcional, usa "Aula N" se vazio
  data: string;      // 'YYYY-MM-DD'
  hora: string;      // 'HH:MM'
  link: string;
  professor: string;
}

export interface GrupoConfig {
  nickname: string;
  jid: string;
  link?: string;         // link de convite WhatsApp (https://chat.whatsapp.com/...)
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
  // NPA only — produto Vega por turma (matching do webhook de pagamento)
  vega_produto_id?: string;       // nome exato do produto Vega - Turma Manhã
  vega_produto_tarde?: string;    // nome exato do produto Vega - Turma Tarde

  // Etapa 4
  aulas: AulaConfig[];
  links_extras: Array<{ key: string; value: string }>;

  // Etapa 5
  bv_wpp_ativo: boolean;
  bv_wpp_mensagem: string;          // manhã (ou turma única para lançamentos)
  bv_wpp_mensagem_tarde?: string;   // NPA: sale_paid turma tarde
  pix_mensagem_template?: string;   // NPA: sale_wait_payment (ambas turmas)
  bv_email_ativo: boolean;
  bv_email_assunto: string;
  bv_email_corpo: string;
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

function checkVar(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text);
}

// ─── Construtores de mensagem ─────────────────────────────────────────────────

function textMsg(
  fn: string,
  day: number,
  scheduledAt: Date,
  recipientId: string,
  text: string,
  label: string,
  opts: Partial<TemplateMensagem> = {},
): TemplateMensagem {
  return {
    day_number: day,
    scheduled_at: toISO(scheduledAt),
    recipient_type: 'group',
    recipient_id: recipientId,
    message_type: 'text',
    message_text: text,
    link_preview: false,
    mention_everyone: false,
    send_header_image: false,
    update_group_picture: false,
    subtipo: '',
    status: 'scheduled',
    funnel_name: fn,
    label,
    hasUnresolvedVar: checkVar(text),
    ...opts,
  };
}

function pollMsg(
  fn: string,
  day: number,
  scheduledAt: Date,
  recipientId: string,
  pollName: string,
  pollOptions: string[],
  label: string,
): TemplateMensagem {
  return {
    day_number: day,
    scheduled_at: toISO(scheduledAt),
    recipient_type: 'group',
    recipient_id: recipientId,
    message_type: 'poll',
    message_text: '',
    link_preview: false,
    mention_everyone: false,
    send_header_image: false,
    update_group_picture: false,
    subtipo: '',
    status: 'scheduled',
    funnel_name: fn,
    label,
    hasUnresolvedVar: false,
    poll_name: pollName,
    poll_options: pollOptions,
  };
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateLancamentoMessages(config: WizardConfig): TemplateMensagem[] {
  if (!config.data_live) return [];

  const live = new Date(config.data_live + 'T' + (config.hora_live || '20:00') + ':00');
  const fn   = config.nome;
  const g1   = '{{grupo_1}}';
  const g2   = config.grupos.length >= 2 ? '{{grupo_2}}' : '{{grupo_1}}';

  // ── Helpers de aula ──────────────────────────────────────────────────────────
  const aula     = (n: number) => config.aulas[n - 1];
  const aulaTit  = (n: number) => aula(n)?.titulo?.trim() || `Aula ${n}`;
  const aulaData = (n: number) => aula(n)?.data ? fmtDate(aula(n).data) : `{{data_aula_${n}}}`;
  const aulaDia  = (n: number) => aula(n)?.data ? fmtDayWeek(aula(n).data) : '';
  const aulaHora = (n: number) => aula(n)?.hora || '20:00';
  const aulaH    = (n: number) => aulaHora(n).slice(0, 5);  // "20:00"
  const aulaLink = (n: number) => aula(n)?.link || `{{link_aula_${n}}}`;
  const aulaProf = (n: number) => aula(n)?.professor || `{{professor_${n}}}`;

  const numAulas = config.tipo === 'lancamento'
    ? Math.min(config.aulas.length || 3, 3)
    : 1;

  // Bloco de datas das aulas (para mensagens de aquecimento)
  function aulasDates(): string {
    const lines: string[] = [];
    for (let i = 1; i <= numAulas; i++) {
      const dia  = aulaDia(i) ? `${aulaDia(i)}, ` : '';
      const hora = aulaH(i);
      lines.push(`📅 *${dia}${aulaData(i)} — ${aulaTit(i)}* — ${hora}`);
    }
    return lines.join('\n');
  }

  // Bloco de links para CTAs
  function linkBlock(): string {
    const lines: string[] = [];
    for (let i = 1; i <= numAulas; i++) {
      lines.push(`*Aula 0${i}:* ${aulaLink(i)}`);
    }
    return lines.join('\n');
  }

  const msgs: TemplateMensagem[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // LANÇAMENTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (config.tipo === 'lancamento') {

    const warmupDays  = 8;
    const warmupStart = addDays(live, -warmupDays);

    // ── 8 dias de aquecimento — dor real → psicanálise → aula ─────────────────
    const dias = [
      // Dia 1 — Boas-vindas + A armadilha da mudança sem raiz
      {
        manhaTxt: `Você acabou de entrar no lugar certo.\n\nPorque aposto que você já tentou mudar.\n\nLeu livros. Fez cursos. Prometeu pra si mesmo que dessa vez seria diferente.\n\nE por um tempo funcionou. Mas depois os mesmos padrões voltaram — o mesmo cansaço, a mesma sensação de que você está rodando em círculos.\n\nIsso não é falta de esforço. É falta de acesso.\n\nA psicanálise não trabalha com força de vontade. Ela trabalha com o que está *abaixo* da consciência — onde os padrões que te travam realmente vivem.\n\nNos próximos ${warmupDays} dias, você vai entender exatamente o que está te impedindo. E nas ${numAulas} aulas ao vivo, vamos fundo nisso juntos.\n\n${aulasDates()}\n\n👆 Salva as datas. Entra ao vivo. A gravação não substitui o ao vivo.\n\nReaja com ❤️ se você chegou até aqui cansado de tentar na força.\n\n${linkBlock()}`,
        tardeIntro: `Antes de começar, preciso te conhecer melhor.\n\nResponde com honestidade — ninguém vai te julgar aqui:`,
        pollNome: 'O que você mais tenta mudar na sua vida e não consegue?',
        pollOps: ['Autossabotagem — chego perto e tudo desmorona', 'Relacionamentos — sempre me envolvo com as pessoas erradas', 'Ansiedade — minha cabeça não para nunca', 'Autoestima — me cobro mais do que me aceito'],
        noiteTxt: `Tem algo que ninguém te conta sobre mudança:\n\nVocê pode querer mudar com toda a força que tem.\nPode se esforçar, lutar, prometer.\n\nMas se o padrão está no inconsciente — você vai continuar repetindo.\n\nNão porque você é fraco.\nMas porque você está tentando resolver um problema do nível 2 com uma solução do nível 1.\n\nA psicanálise existe para isso. Para acessar o que está abaixo — e mudar a partir da raiz.\n\nEm ${warmupDays} dias, começamos.\n\n${aulasDates()}\n\nReaja com ❤️ se você vai estar ao vivo.\n\n${linkBlock()}`,
      },

      // Dia 2 — A autossabotagem
      {
        manhaTxt: `Você já estava quase lá.\n\nQuase terminando o projeto. Quase assumindo o relacionamento. Quase dando o próximo passo.\n\nAí algo aconteceu. Um motivo surgiu. Você adiou, cancelou, desistiu.\n\nE depois ficou se perguntando: *por que eu faço isso?*\n\nIsso tem nome. Chama autossabotagem. E ela não é fraqueza — é o inconsciente tentando te proteger de algo que aprendeu, em algum momento da sua vida, que é perigoso.\n\nO problema é que o que um dia foi proteção, hoje é uma prisão.\n\nNa *${aulaTit(1)}*, vamos desmontar exatamente isso. Como o inconsciente cria esses bloqueios — e como ressignificá-los.\n\n📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}, ${aulaH(1)}h*\n👉 ${aulaLink(1)}\n\nFaltam *${warmupDays - 1} dias*.\n\nReaja com 🔥 se você já se sabotou quando estava quase chegando lá.`,
        tardeIntro: `Vai fundo nessa — responde com sinceridade:`,
        pollNome: 'Quando você está perto de dar o próximo passo, o que acontece?',
        pollOps: ['Trava e fico pensando demais', 'Crio um motivo pra adiar', 'Diminuo o que já conquistei', 'Procuro um defeito na oportunidade'],
        noiteTxt: `A autossabotagem não acontece porque você é limitado.\n\nEla acontece porque uma parte de você acredita — inconscientemente — que você não merece o que está a um passo de ter.\n\nOu que se você chegar lá, algo vai dar errado de qualquer jeito.\n\nEssa crença não foi criada por você hoje. Foi construída em algum momento da sua história — e ficou operando nos bastidores desde então.\n\nEntender de onde ela vem é o primeiro passo para dissolvê-la.\n\nEm ${warmupDays - 1} dias, a *${aulaTit(1)}* vai te mostrar como fazer isso.\n\n📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}, ${aulaH(1)}h*\n👉 ${aulaLink(1)}\n\nFaltam *${warmupDays - 1} dias*.`,
      },

      // Dia 3 — Os relacionamentos que se repetem
      {
        manhaTxt: `Você já reparou como certas histórias se repetem?\n\nMuda o nome. Muda o rosto. Mas a dor no final é sempre a mesma.\n\nO abandono. A decepção. A sensação de que você não é suficiente para quem você mais ama.\n\nIsso não é azar. E não é "tipo errado de pessoa".\n\nÉ o inconsciente recriando o padrão que ele aprendeu cedo — para te dar uma nova chance de resolver o que ficou mal resolvido.\n\nSó que sem entender esse mecanismo, você vai continuar tentando resolver o problema do jeito errado.\n\nNa *${aulaTit(Math.min(2, numAulas))}*, vamos entender por que você atrai quem atrai — e o que isso diz sobre o que você carrega.\n\n📅 *${aulaDia(Math.min(2, numAulas))}, ${aulaData(Math.min(2, numAulas))} — ${aulaTit(Math.min(2, numAulas))}, ${aulaH(Math.min(2, numAulas))}h*\n👉 ${aulaLink(Math.min(2, numAulas))}\n\nFaltam *${warmupDays - 2} dias*.\n\nReaja com ❤️ se você já ficou sem entender por que certos padrões se repetem.`,
        tardeIntro: `Uma pergunta que vai fundo — responde com honestidade:`,
        pollNome: 'Nos seus relacionamentos (afetivos ou não), o que mais se repete?',
        pollOps: ['Abandono ou rejeição no final', 'Eu me perco tentando agradar', 'Sempre escolho alguém que me decepciona', 'Tenho medo de me abrir de verdade'],
        noiteTxt: `Existe um conceito na psicanálise chamado *compulsão à repetição*.\n\nÉ a tendência do inconsciente de recriar situações emocionais familiares — mesmo quando elas são dolorosas.\n\nNão porque você gosta de sofrer.\nMas porque o inconsciente busca resolver o que ficou irresolvido.\n\nO problema: sem consciência, você vai repetir para sempre.\n\nCom consciência, você pode finalmente mudar o padrão.\n\nEm ${warmupDays - 2} dias, a *${aulaTit(Math.min(2, numAulas))}* vai te dar essa consciência.\n\n📅 *${aulaDia(Math.min(2, numAulas))}, ${aulaData(Math.min(2, numAulas))} — ${aulaTit(Math.min(2, numAulas))}, ${aulaH(Math.min(2, numAulas))}h*\n👉 ${aulaLink(Math.min(2, numAulas))}\n\nFaltam *${warmupDays - 2} dias*.`,
      },

      // Dia 4 — A ansiedade e o controle
      {
        manhaTxt: `Você consegue desligar?\n\nOu sua cabeça está sempre ligada — revisando o passado, antecipando o futuro, preenchendo cada silêncio com pensamentos?\n\nAnsiedade não é um defeito de personalidade. É o inconsciente tentando controlar o que ele aprendeu a temer.\n\nO problema é que esse controle cansa. Isola. E acaba te mantendo longe exatamente do que você mais quer — leveza, presença, conexão real.\n\nA psicanálise não trata a ansiedade com técnicas de respiração.\nEla pergunta: *do que você está fugindo ao não conseguir parar?*\n\nEssa resposta está na *${aulaTit(1)}*.\n\n📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}, ${aulaH(1)}h*\n👉 ${aulaLink(1)}\n\nFaltam *${warmupDays - 3} dias*.\n\nReaja com 🔥 se a sua cabeça nunca para.`,
        tardeIntro: `Você vai se identificar com pelo menos uma dessas — responde:`,
        pollNome: 'Como a ansiedade aparece mais na sua vida?',
        pollOps: ['Fico revisando o que disse ou fiz', 'Antecipo o pior em tudo', 'Não consigo estar presente nas coisas', 'Me sinto responsável por tudo ao meu redor'],
        noiteTxt: `Aqui está o que a maioria das pessoas faz com a ansiedade:\n\nTenta controlar mais.\nPlaneja mais. Trabalha mais. Produz mais.\n\nE a sensação passa por um momento — até voltar mais forte.\n\nPorque a ansiedade não é sobre o que está fora. É sobre o que está dentro e ainda não foi olhado.\n\nNa *${aulaTit(1)}*, vamos entender o que está por baixo dessa necessidade de controle — e como se libertar disso.\n\n📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}, ${aulaH(1)}h*\n👉 ${aulaLink(1)}\n\nFaltam *${warmupDays - 3} dias*.`,
      },

      // Dia 5 — O crítico interno
      {
        manhaTxt: `Você já parou para prestar atenção no que fala pra você mesmo?\n\nNão o que você diz em voz alta. O que você fala internamente, quando erra, quando decepciona alguém, quando não atinge o que esperava.\n\n*"Eu nunca faço nada certo."*\n*"Eu não mereço isso."*\n*"Quem eu penso que sou?"*\n\nEssa voz tem um nome na psicanálise. E ela não surgiu do nada.\n\nEla foi construída por vozes externas que você internalizou — e que agora operam como se fossem suas.\n\nO primeiro passo para silenciá-la não é ignorá-la. É entender de onde ela veio.\n\nEssa é uma das coisas que vamos trabalhar na *${aulaTit(Math.min(3, numAulas))}*.\n\n📅 *${aulaDia(Math.min(3, numAulas))}, ${aulaData(Math.min(3, numAulas))} — ${aulaTit(Math.min(3, numAulas))}, ${aulaH(Math.min(3, numAulas))}h*\n👉 ${aulaLink(Math.min(3, numAulas))}\n\nFaltam *${warmupDays - 4} dias*.`,
        tardeIntro: `Esse vai fundo — mas responde com honestidade:`,
        pollNome: 'Como a autocrítica aparece mais forte em você?',
        pollOps: ['Me comparo com os outros o tempo todo', 'Nunca acho que fiz o suficiente', 'Me cobro por erros que já passei', 'Tenho medo de parecer fraco ou incapaz'],
        noiteTxt: `A autocrítica não te torna melhor.\n\nEla só te deixa exausto.\n\nVocê sabe disso. Mas não consegue parar.\n\nPorque essa voz não é sua — é uma introje ção de algo que você aprendeu que era perigoso não fazer. Ser perfeito. Ser suficiente. Não decepcionar.\n\nEntender isso não é desculpa. É libertação.\n\nNa *${aulaTit(Math.min(3, numAulas))}*, vamos desmontar esse crítico interno e entender o que ele está realmente protegendo.\n\n📅 *${aulaDia(Math.min(3, numAulas))}, ${aulaData(Math.min(3, numAulas))} — ${aulaTit(Math.min(3, numAulas))}, ${aulaH(Math.min(3, numAulas))}h*\n👉 ${aulaLink(Math.min(3, numAulas))}\n\nFaltam *${warmupDays - 4} dias*.`,
      },

      // Dia 6 — 3 dias — Visão geral das aulas + FOMO
      {
        manhaTxt: `Faltam *3 dias*.\n\nVou te falar o que vai acontecer em cada aula — e por que você não pode perder nenhuma delas ao vivo.\n\n${aulasDates()}\n\nO que vai ser diferente nessa jornada?\n\nNão vamos dar dicas. Não vamos ensinar técnicas de respiração. Não vamos falar sobre hábitos.\n\nVamos entrar de verdade no que está te travando — a partir da raiz, pela via do inconsciente.\n\nE quem estiver ao vivo vai ter acesso a algo que a gravação não captura:\n\nDinâmicas em tempo real. Perguntas respondidas. A energia do grupo processando junto.\n\nA gravação ficará disponível — mas a experiência ao vivo é insubstituível.\n\nReaja com 🔥 se você vai estar presente nas 3 aulas.\n\n${linkBlock()}`,
        tardeIntro: `Estamos a 3 dias das aulas. Quero saber onde você está:`,
        pollNome: 'Em qual área da vida você mais quer transformação agora?',
        pollOps: ['Minha saúde emocional e paz interna', 'Meus relacionamentos (amor, família, amizades)', 'Minha carreira e realização profissional', 'Minha autoestima e autoconhecimento'],
        noiteTxt: `Pensa comigo:\n\nQuanto tempo você já passou tentando entender por que você é do jeito que você é?\n\nCom amigos, terapeutas, livros, podcasts — buscando respostas.\n\nEm 3 dias, começamos uma jornada que vai te dar essas respostas de um jeito que você provavelmente nunca teve acesso antes.\n\nNão como informação. Como experiência.\n\nVocê vai sair das ${numAulas} aulas entendendo coisas sobre si mesmo que estão te limitando há anos.\n\n${aulasDates()}\n\nReaja com ❤️ se você vai estar ao vivo.\n\n${linkBlock()}`,
      },

      // Dia 7 — 2 dias — Urgência real
      {
        manhaTxt: `Faltam *2 dias*.\n\nDeixa eu te fazer uma pergunta direta:\n\nSe você não mudar nenhum padrão nos próximos meses — como vai ser a sua vida daqui a um ano?\n\nOs mesmos ciclos. As mesmas travadas. A mesma sensação de "quase lá".\n\nNão estou falando isso pra te assustar. Estou falando porque sei que você não chegou até aqui à toa.\n\nVocê está nesse grupo porque algo em você sabe que precisa de uma virada real.\n\nE em 2 dias, essa virada começa.\n\n${aulasDates()}\n\nReaja com 🔥 se você está pronto pra ir fundo.\n\nEntrada nas aulas ao vivo:\n${linkBlock()}`,
        tardeIntro: `A 2 dias das aulas — responde isso:`,
        pollNome: 'O que mais te impede de alcançar o que você quer?',
        pollOps: ['Meu próprio medo de falhar ou ser julgado', 'Relacionamentos que me drenam a energia', 'Ansiedade e paralisia na tomada de decisão', 'Não me sentir suficiente para o que quero'],
        noiteTxt: `Quem já passou por uma jornada profunda de psicanálise costuma dizer a mesma coisa:\n\n*"Eu vivia no automático e não sabia."*\n\nNão porque eram ignorantes. Mas porque o inconsciente é exatamente isso — invisível. Você age, reage, escolhe e sente sem perceber de onde vem.\n\nAté que alguém te dá acesso às ferramentas certas.\n\nEm 2 dias, é isso que vai acontecer.\n\n${aulasDates()}\n\nEntrada nas aulas:\n${linkBlock()}`,
      },

      // Dia 8 — Véspera — FOMO máximo
      {
        manhaTxt: `Amanhã começa.\n\nVou ser direto: quem aparecer ao vivo vai ter uma experiência completamente diferente de quem assistir pela gravação depois.\n\nAs dinâmicas que acontecem em tempo real.\nAs perguntas que surgem no calor da aula.\nA energia de um grupo processando junto ao vivo.\n\nNada disso se captura em vídeo.\n\nA *${aulaTit(1)}* começa amanhã, *${aulaDia(1)}, ${aulaData(1)}, às ${aulaH(1)}h*.\n\nUma pergunta para você carregar durante o dia:\n\n*Se eu pudesse entender completamente o que me trava — o que mudaria na minha vida?*\n\nChega com essa pergunta. A aula vai responder.\n\n👉 ${aulaLink(1)}\n\nReaja com 🔥 se você vai estar lá amanhã.`,
        tardeIntro: `Véspera. Uma última enquete antes de amanhã:`,
        pollNome: 'Qual é a maior mudança que você quer na sua vida a partir de agora?',
        pollOps: ['Parar de me sabotar e agir de verdade', 'Ter relacionamentos mais saudáveis e reais', 'Me libertar da ansiedade e do excesso de controle', 'Começar a me amar sem precisar de aprovação'],
        noiteTxt: `Amanhã, às ${aulaH(1)}, começa a *${aulaTit(1)}*.\n\nUma coisa que eu preciso que você entenda:\n\nNão existe momento ideal para começar a se conhecer de verdade.\n\nSempre vai ter algo urgente. Sempre vai ter um motivo pra adiar.\n\nMas enquanto você adia, os padrões continuam operando. Os ciclos continuam se repetindo. O cansaço continua se acumulando.\n\nAmanhã você tem a chance de fazer diferente.\n\nChega com caderno, caneta e disposição pra olhar pra dentro.\n\n📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}, ${aulaH(1)}h*\n👉 ${aulaLink(1)}\n\nFalta *1 dia*. Não perca.`,
      },
    ];

    // ── Gerar dias de aquecimento ──────────────────────────────────────────────
    for (let i = 0; i < warmupDays; i++) {
      const day     = i + 1;
      const dayDate = addDays(warmupStart, i);
      const d       = dias[i];

      msgs.push(textMsg(fn, day, setTime(dayDate, '11:00'), g1,
        d.manhaTxt, `Dia ${day} — Manhã`, { link_preview: true }));

      msgs.push(textMsg(fn, day, setTime(dayDate, '17:00'), g1,
        d.tardeIntro + '\n\n👇',
        `Dia ${day} — Enquete (intro)`));

      msgs.push(pollMsg(fn, day,
        new Date(setTime(dayDate, '17:00').getTime() + 3 * 60 * 1000),
        g1, d.pollNome, d.pollOps, `Dia ${day} — Enquete`));

      msgs.push(textMsg(fn, day, setTime(dayDate, '23:00'), g1,
        d.noiteTxt, `Dia ${day} — Noite`, { link_preview: true }));
    }

    // ── Gerar dias de aula ─────────────────────────────────────────────────────
    for (let i = 1; i <= numAulas; i++) {
      const aulaDateStr  = aula(i)?.data || config.data_live;
      const aulaDateObj  = new Date(aulaDateStr + 'T12:00:00');
      const dayNum       = warmupDays + i;
      const aulaDateHora = setTime(aulaDateObj, aulaHora(i));

      const manhaTxt = i === 1
        ? `*HOJE É O DIA.*\n\nTudo que conversamos nesse grupo nos últimos dias converge agora.\n\nEssa noite, às ${aulaH(i)}, começa a *${aulaTit(i)}*.\n\nEu sei que você tem sua rotina. Tem compromissos. Tem mil coisas pra fazer.\n\nMas deixa eu te perguntar: quantas vezes você colocou tudo em primeiro lugar — menos você mesmo?\n\nEssa aula é pra você. Chega ao vivo.\n\nTrás caderno, caneta e disposição pra ir fundo.\n\n📅 *Hoje, ${aulaData(i)} — ${aulaTit(i)}, ${aulaH(i)}h*\n👉 ${aulaLink(i)}`
        : `Se a *${aulaTit(i - 1)}* te mexeu — prepara o coração.\n\nHoje vai mais fundo.\n\nA *${aulaTit(i)}* começa às ${aulaH(i)}h. E o que vem pela frente vai continuar o que começou ontem — só que em um nível que você ainda não viu.\n\nEsteja ao vivo. A gravação não captura o que acontece em tempo real.\n\n📅 *Hoje, ${aulaData(i)} — ${aulaTit(i)}, ${aulaH(i)}h*\n👉 ${aulaLink(i)}`;

      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '11:00'), g1, manhaTxt,
        `${aulaTit(i)} — Manhã`, { link_preview: true }));

      const tardeTxt = i === 1
        ? `Hoje à noite começa a *${aulaTit(i)}*.\n\nUma coisa antes de começar:\n\nNão assista a essa aula deitado no sofá com o celular na mão.\n\nSente em um lugar tranquilo. Com caderno e caneta. Pronto pra registrar o que vai surgir.\n\nEssa aula vai abrir coisas. E você vai querer ter escrito.\n\nNos vemos às ${aulaH(i)}h.\n\n👉 ${aulaLink(i)}`
        : `Depois de tudo que a *${aulaTit(i - 1)}* trouxe — quero saber:\n\nO que mais te pegou? O que ficou reverberando?\n\nEssa pergunta não é retórica. Leva ela pra aula de hoje.\n\nA *${aulaTit(i)}* começa às ${aulaH(i)}h.\n\n👉 ${aulaLink(i)}`;

      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '17:00'), g1, tardeTxt,
        `${aulaTit(i)} — Tarde`, { link_preview: true }));

      // Contagem regressiva
      const countdown: [number, string][] = [[-3, '3 HORAS'], [-2, '2 HORAS'], [-1, '1 HORA']];
      for (const [offset, label] of countdown) {
        const t = new Date(aulaDateHora.getTime() + offset * 60 * 60 * 1000);
        const txt = offset === -3
          ? `⏰ *Faltam ${label} para a ${aulaTit(i)}.*\n\nVocê já está com o link salvo?\n\nNão corra o risco de perder o início. A aula começa no horário — e os primeiros minutos são os mais importantes.\n\n👉 ${aulaLink(i)}`
          : offset === -2
          ? `⏰ *Faltam ${label}.*\n\nChecklist rápido:\n✅ Local tranquilo\n✅ Caderno e caneta na mão\n✅ Celular no silencioso\n✅ Link aberto e testado\n\nVocê não vai se arrepender de ter estado ao vivo.\n\n👉 ${aulaLink(i)}`
          : `⏰ *Falta ${label} para a ${aulaTit(i)}!*\n\nReage com 🔥 se você vai estar ao vivo agora!\n\n👉 ${aulaLink(i)}`;
        msgs.push(textMsg(fn, dayNum, t, g1, txt,
          `${aulaTit(i)} — -${Math.abs(offset)}h`,
          { link_preview: true, mention_everyone: offset === -1 }));
      }

      // AO VIVO
      msgs.push(textMsg(fn, dayNum, aulaDateHora, g1,
        `🔴 *AO VIVO AGORA — ${aulaTit(i).toUpperCase()}*\n\nComeçou. Não perde o início.\n\nEntra agora e desliga o que não é urgente — essa aula merece a sua presença total.\n\n👉 ${aulaLink(i)}\n\nReage com ❤️ quando entrar!`,
        `${aulaTit(i)} — AO VIVO`,
        { link_preview: true, mention_everyone: true }));

      // Pós-aula
      if (i < numAulas) {
        const pos = new Date(aulaDateHora.getTime() + 3 * 60 * 60 * 1000);
        msgs.push(textMsg(fn, dayNum, pos, g1,
          `A *${aulaTit(i)}* encerrou.\n\nSe você estava ao vivo — como você está?\n\nÉ normal que surja muito depois de uma aula assim. Deixa surgir. Anota. Processa.\n\nA *${aulaTit(i + 1)}* continua amanhã. Vai mais fundo.\n\n📹 Gravação disponível por 48h — mas esteja ao vivo amanhã:\n👉 ${aulaLink(i + 1)}`,
          `${aulaTit(i)} — Pós-aula`, { link_preview: true }));
      }
    }

    // ── Oferta pós-evento ──────────────────────────────────────────────────────
    const diaOferta    = addDays(live, numAulas);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';
    const baseDay      = warmupDays + numAulas;

    msgs.push(textMsg(fn, baseDay + 1, setTime(diaOferta, '10:00'), g2,
      `Você acabou de passar por algo que a maioria das pessoas nunca vai ter acesso.\n\n${numAulas} aulas que foram fundo no que está por trás dos seus padrões. Do que te trava. Do que te faz repetir.\n\nE agora você tem duas opções:\n\n1️⃣ Levar o que aprendeu e tentar aplicar sozinho — como já fez outras vezes.\n\n2️⃣ Continuar esse trabalho com estrutura, suporte e profundidade real.\n\nPara quem quer ir além, as matrículas abriram agora.\n\nSão vagas limitadas — e quem passou pelas aulas ao vivo tem prioridade.\n\n👉 ${linkCheckout}\n\nAs vagas não esperam.`,
      'Oferta — Abertura', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 2, setTime(addDays(diaOferta, 1), '19:00'), g2,
      `Ontem abriram as matrículas. E muita gente já garantiu a vaga.\n\nSe você ainda está pensando — entendo. Toda decisão real exige coragem.\n\nMas deixa eu te perguntar algo:\n\nO que vai ser diferente daqui a 6 meses se você continuar do jeito que está?\n\nOs mesmos padrões. Os mesmos ciclos. A mesma sensação de quase lá.\n\nOu você pode fazer algo diferente agora.\n\n👉 ${linkCheckout}\n\nVagas ainda disponíveis — mas não por muito tempo.`,
      'Oferta — Follow-up +1', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 3, setTime(addDays(diaOferta, 2), '18:00'), g2,
      `⚠️ *Amanhã encerram as matrículas.*\n\nNão vou ficar mandando mensagem insistindo. Respeito a sua decisão.\n\nMas se você saiu das aulas sentindo que algo virou — que você viu coisas que não pode mais ignorar — saiba que o próximo passo está disponível agora.\n\nDepois de amanhã, não tem como garantir vaga.\n\n👉 ${linkCheckout}`,
      'Oferta — Escassez +2', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 4, setTime(addDays(diaOferta, 3), '12:00'), g2,
      `🔒 *Hoje é o último dia.*\n\nAs matrículas fecham à meia-noite.\n\nSe você estava esperando o momento certo — ele é agora.\n\nO momento certo não existe. Existe a decisão que você toma antes de estar completamente pronto.\n\nE essa decisão, tomada hoje, pode mudar o que vem depois.\n\n👉 ${linkCheckout}\n\nDepois da meia-noite, a porta fecha.`,
      'Oferta — Encerramento +3', { link_preview: true, mention_everyone: true }));

  // ═══════════════════════════════════════════════════════════════════════════
  // NPA — PRESENCIAL
  // ═══════════════════════════════════════════════════════════════════════════
  } else {
    const warmupDays  = 3;
    const warmupStart = addDays(live, -warmupDays);

    // Helpers para NPA presencial
    const npaLocal = aulaLink(1); // endereço / Google Maps configurado no wizard
    const npaInfo  = `📅 *${aulaDia(1)}, ${aulaData(1)} — ${aulaTit(1)}*\n⏰ ${aulaH(1)}h\n📍 ${npaLocal}`;

    const diasNpa = [
      // Dia 1 NPA — Boas-vindas + dor real
      {
        manhaTxt: `Você entrou.\n\nE isso já diz muito sobre você.\n\nA maioria das pessoas passa a vida convivendo com padrões que não quer — relacionamentos que se repetem, ansiedades que não passam, autossabotagem toda vez que estava quase chegando lá.\n\nSem nunca parar pra entender de onde isso vem.\n\nVocê escolheu fazer diferente.\n\nEm ${warmupDays} dias, você vai estar presencialmente em um encontro que foi desenhado para ir fundo — não em teoria, mas em experiência real.\n\nNão existe gravação. Não existe replay. O que vai acontecer nesse dia só vai existir para quem estiver lá.\n\n${npaInfo}\n\nFaltam *${warmupDays} dias*.\n\nReaja com ❤️ se você vai aparecer.`,
        tardeIntro: `Antes de começar, quero te conhecer melhor — responde com honestidade:`,
        pollNome: 'O que mais te trouxe até aqui?',
        pollOps: ['Cansaço de repetir os mesmos padrões', 'Relacionamentos que sempre decepcionam', 'Ansiedade que não me deixa em paz', 'Quero me entender de verdade'],
        noiteTxt: `A maior parte das coisas que nos travam não está no consciente.\n\nEstá no inconsciente — operando nos bastidores de cada decisão, reação e escolha que você faz.\n\nE enquanto ele não for acessado, você pode tentar mudar o quanto quiser. Os padrões voltam.\n\nNo nosso encontro presencial, vamos abrir esse acesso — com profundidade que só o ambiente ao vivo proporciona.\n\n${npaInfo}\n\nFaltam *${warmupDays} dias*. Separa o dia na agenda agora.`,
      },

      // Dia 2 NPA — Padrão que se repete
      {
        manhaTxt: `Você já percebeu que certos padrões se repetem na sua vida — não importa o quanto você tente mudar?\n\nMuda o contexto. Muda a pessoa. Muda o emprego.\nMas a mesma sensação volta.\n\nIsso não é azar. É o inconsciente recriando o que aprendeu — na tentativa de te dar uma nova chance de resolver o que ficou irresolvido.\n\nSem entender esse mecanismo, você vai continuar preso nele.\n\nNo nosso encontro presencial, vamos desmontar esse ciclo juntos.\n\nE quem não estiver lá não vai ter acesso a esse conteúdo em nenhum outro lugar — não existe versão online, não existe gravação.\n\n${npaInfo}\n\nFaltam *2 dias*.\n\nReaja com 🔥 se você já se pegou repetindo um padrão que queria ter quebrado.`,
        tardeIntro: `A pergunta de hoje vai fundo — responde com sinceridade:`,
        pollNome: 'Qual situação da sua vida mais se repete de formas diferentes?',
        pollOps: ['Me saboto quando estou perto do que quero', 'Me envolvo com pessoas que me decepcionam', 'Fico preso(a) em ciclos de ansiedade e controle', 'Me cobro mais do que me aceito'],
        noiteTxt: `Duas perguntas para você levar pra dormir:\n\n*Por que você reage do jeito que reage?*\n*Por que você escolhe o que escolhe — mesmo quando sabe que vai doer?*\n\nEssas não são perguntas filosóficas. São as perguntas que, quando respondidas, mudam tudo.\n\nAmanhã damos o último passo antes do nosso encontro presencial.\n\n${npaInfo}\n\nFaltam *2 dias*. Confirma com alguém que você vai aparecer — isso aumenta em muito a chance de você realmente ir.`,
      },

      // Dia 3 NPA — Véspera — FOMO presencial
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
        d.tardeIntro + '\n\n👇',
        `Dia ${day} — Enquete (intro)`));

      msgs.push(pollMsg(fn, day,
        new Date(setTime(dayDate, '17:00').getTime() + 3 * 60 * 1000),
        g1, d.pollNome, d.pollOps, `Dia ${day} — Enquete`));

      msgs.push(textMsg(fn, day, setTime(dayDate, '23:00'), g1,
        d.noiteTxt, `Dia ${day} — Noite`, { link_preview: true }));
    }

    // ── Dia do evento NPA presencial ───────────────────────────────────────────
    const aulaDateObj  = new Date(config.data_live + 'T12:00:00');
    const aulaDateHora = setTime(aulaDateObj, aulaHora(1));
    const dayNum       = warmupDays + 1;

    msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '08:00'), g1,
      `*HOJE É O DIA.*\n\nDaqui algumas horas você vai estar em um lugar que muito pouca gente tem coragem de ir — dentro de si mesmo, de verdade.\n\nO encontro começa às ${aulaH(1)}h. Organize sua manhã com calma e chegue no horário — o início é parte da experiência.\n\nNão existe gravação. O que vai acontecer hoje existe só hoje, só para quem estiver lá.\n\nTrás caderno e caneta.\n\n${npaInfo}\n\nReage com ❤️ se você vai aparecer hoje.`,
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

    // Oferta pós-NPA
    const diaOferta    = addDays(live, 1);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';

    msgs.push(textMsg(fn, dayNum + 1, setTime(diaOferta, '10:00'), g2,
      `Como você está depois de ontem?\n\nO que acontece em um encontro presencial como esse não cabe em palavra. Mas você sabe o que foi.\n\nAlguma coisa em você virou ontem. E agora você tem uma escolha:\n\nDeixa isso como uma boa experiência — ou usa isso como ponto de partida para uma transformação real.\n\nPara quem quer continuar esse trabalho com estrutura, profundidade e acompanhamento:\n\nAs matrículas estão abertas. São vagas limitadas e quem esteve no evento tem prioridade.\n\n👉 ${linkCheckout}\n\nNão existe o momento perfeito. Existe a decisão que você toma antes de estar completamente pronto.`,
      'Oferta Pós-NPA', { link_preview: true, mention_everyone: true }));
  }

  // Marca como draft se tiver variável não resolvida
  return msgs.map(m => ({ ...m, status: m.hasUnresolvedVar ? 'draft' : 'scheduled' }));
}

// ─── Helpers para o wizard ────────────────────────────────────────────────────

export function buildFunnelVariaveis(config: WizardConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  config.grupos.forEach((g, i) => {
    if (g.jid)  vars[`grupo_${i + 1}`]     = g.jid;
    if (g.link) vars[`link_grupo_${i + 1}`] = g.link;
  });

  // Para NPA: aliases semânticos por turma + templates das mensagens automáticas
  if (config.tipo === 'npa') {
    if (config.grupos[0]?.jid)  vars['grupo_manha']       = config.grupos[0].jid;
    if (config.grupos[0]?.link) vars['link_grupo_manha']  = config.grupos[0].link;
    if (config.grupos[1]?.jid)  vars['grupo_tarde']       = config.grupos[1].jid;
    if (config.grupos[1]?.link) vars['link_grupo_tarde']  = config.grupos[1].link;
    // Mensagens Vega — lidas pelo vega-webhook
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
