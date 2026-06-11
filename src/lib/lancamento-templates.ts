/**
 * lancamento-templates.ts
 * Gera sequência padrão de mensagens para um lançamento ou NPA.
 *
 * Lançamento — 9 dias de aquecimento (countdown) + dias de aula:
 *   Manhã (~8-10h) — saudação + countdown + datas
 *   Tarde (~14h)   — enquete (intro + poll) ou sugestão de áudio
 *   Noite (~22h)   — countdown + links (véspera usa horário da aula)
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

    for (let offset = -warmupDays; offset <= -1; offset++) {
      const l       = Math.abs(offset);
      const day     = warmupDays + offset + 1;   // 1..9
      const dayDate = addDays(firstClassDate, offset);
      const manhaH  = offset <= -7 ? '10:00' : '08:00';

      // Manhã
      const manhaTxt = offset === -1
        ? `${slogan} dia! ☀️\n\n*Amanhã começa a ${config.nome}.*\n\nSerão ${numAulas} aulas ao vivo para mexer com a forma como cada pessoa se enxerga.\n\n${profAnchor} conduz essa jornada com participação de ${profConv}.\n\n👉 Ativa o lembrete da Aula 1: ${aulaLink(1)}\n\nReage com um 🙌 se você vai estar ao vivo!`
        : `${slogan} dia! ☀️\n\nBem-vindo à ${config.nome}!\n\nFaltam *${l} dias* para começarmos essa jornada.\n\n${datesBlock()}\n\nSempre às *${classHora}*, ao vivo no YouTube.\n\nCom ${profDupla}.\n\n👉 Ativa o lembrete da Aula 1: ${aulaLink(1)}\n\nReage com um ❤️ pra eu saber que você está aqui com a gente!`;

      msgs.push(textMsg(fn, day, setTime(dayDate, manhaH), g1, manhaTxt,
        `Dia ${day} — Manhã`, { link_preview: true }));

      // Tarde: a cada 3 dias sugere áudio, outros dias faz enquete
      if (l % 3 === 0) {
        const audioTxt = `${slogan} tarde! ☀️\n\n🎙️ *Áudio sugerido do Prof. ${profAnchor}:*\n\n"${slogan}, pessoal! Estamos chegando muito perto da nossa primeira aula. Quero te encontrar ao vivo no dia ${aulaData(1)}, às ${classHora}, para abrir essa jornada com profundidade e direção."\n\n👉 ${aulaLink(1)}\n\nReage com um ❤️ depois de ouvir!`;
        msgs.push(textMsg(fn, day, setTime(dayDate, '14:00'), g1, audioTxt,
          `Dia ${day} — Tarde (Áudio)`, { subtipo: 'audio' }));
      } else {
        const tardeIntro = `${slogan} tarde! ☀️\n\nUma pergunta rápida antes de começarmos essa jornada juntos:\n\n*O que você mais busca em ${produto} neste momento?*\n\nSeleciona a opção que mais combina com você 👇\n\nReage com um 💡 nessa mensagem!`;
        msgs.push(textMsg(fn, day, setTime(dayDate, '14:00'), g1, tardeIntro,
          `Dia ${day} — Enquete (intro)`));
        msgs.push(pollMsg(fn, day,
          new Date(setTime(dayDate, '14:00').getTime() + 3 * 60 * 1000),
          g1,
          `O que você mais busca em ${produto} neste momento?`,
          ['Quero me conhecer melhor', 'Quero ajudar pessoas ao meu redor', `Quero atuar com ${produto}`, 'Quero entender mais antes de decidir'],
          `Dia ${day} — Enquete`));
      }

      // Noite
      const noiteTxt = offset === -1
        ? `${slogan} noite! 🌙\n\n*AMANHÃ, ${classHora}. Ao vivo.*\n\nAula 1 - *${aulaTit(1)}*.\n\nSe você ativar só um lembrete agora, que seja esse:\n\n👉 ${aulaLink(1)}\n\nE já aproveita pra ativar os lembretes das próximas aulas:\n${linksBlock()}\n\nReage com um 🚀 - amanhã a gente se encontra!`
        : `${slogan} noite! 🌙\n\nFaltam *${l} dias* pra ${config.nome}.\n\n${numAulas} aulas ao vivo que podem mudar a forma como você se enxerga.\n\n👉 Já ativa os lembretes e deixa o like:\n\n${linksBlock()}\n\nReage com um 🔥 se você já está ansioso pra começar!`;

      const noiteHora = offset === -1 ? (config.hora_live || '20:00') : '22:00';
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
      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '14:00'), g1,
        `${slogan} tarde! ☀️\n\nHoje às ${aulaH(i)} temos a Aula ${i} - *${aulaTit(i)}*! 🔴\n\n*Como você está chegando para a aula de hoje?*\n\nSeleciona a sua resposta 👇\n\nReage com um ✨ nessa mensagem!`,
        `${aulaTit(i)} — Enquete (intro)`));

      msgs.push(pollMsg(fn, dayNum,
        new Date(setTime(aulaDateObj, '14:00').getTime() + 3 * 60 * 1000),
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
