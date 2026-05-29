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
  bv_wpp_mensagem: string;
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

    const warmupDays = 8;
    const warmupStart = addDays(live, -warmupDays);

    // Conteúdo temático para cada dia de aquecimento
    const dias = [
      // Dia 1 — Boas-vindas
      {
        manhaTema: `Bem-vindo ao grupo e ao que vem pela frente.\n\nVocê acabou de tomar uma decisão que vai mudar a forma como você se enxerga.\n\nNos próximos ${warmupDays} dias, esse espaço vai ser o início de uma jornada que culmina em ${numAulas} aulas ao vivo transformadoras.\n\nFaltam *${warmupDays} dias* para começar.`,
        manhaEmoji: '❤️',
        tardeIntro: 'Primeira enquete da jornada — responda com honestidade:',
        pollNome: 'O que te trouxe até aqui?',
        pollOps: ['Busca por autoconhecimento', 'Quero mudar padrões', 'Curiosidade sobre o tema', 'Indicação de alguém'],
        noiteConteudo: `A jornada para o autoconhecimento começa com uma escolha — e você acabou de fazer a sua.\n\nNos próximos dias, vamos te preparar para ${numAulas} aulas ao vivo que vão revelar o que está por trás dos seus padrões e das suas escolhas.\n\nFaltam *${warmupDays} dias*.`,
      },
      // Dia 2 — Os ciclos que se repetem
      {
        manhaTema: `Você já percebeu como algumas dores parecem se repetir na sua vida?\n\nMuda a pessoa. Muda o cenário. Muda o emprego.\nMas a mesma sensação volta.\n\nIsso não é coincidência. É o inconsciente operando por padrões que você ainda não identificou.\n\nFaltam *${warmupDays - 1} dias*.`,
        manhaEmoji: '🔥',
        tardeIntro: 'Dia 2 — e a pergunta vai direto ao ponto:',
        pollNome: 'Qual padrão você mais quer quebrar?',
        pollOps: ['Autossabotagem', 'Ansiedade emocional', 'Relacionamentos repetitivos', 'Medo de agir'],
        noiteConteudo: `Existe uma diferença enorme entre tentar mudar um comportamento e entender a origem dele.\n\nA maioria das pessoas passa a vida arrancando a folha — sem chegar à raiz.\n\nEm ${warmupDays - 1} dias, a jornada que vai te levar à raiz começa.\n\nFaltam *${warmupDays - 1} dias*.`,
      },
      // Dia 3 — O inconsciente
      {
        manhaTema: `A maior parte das nossas decisões não é consciente.\n\nÉ o inconsciente que molda nossas reações, nossos padrões de relacionamento, nossa forma de agir sob pressão.\n\nEntender isso não é fraqueza — é o primeiro passo para a liberdade.\n\nFaltam *${warmupDays - 2} dias*.`,
        manhaEmoji: '❤️',
        tardeIntro: 'Reflexão do dia — responda com honestidade:',
        pollNome: 'O que mais te desperta curiosidade?',
        pollOps: ['O inconsciente', 'Traumas emocionais', 'Comportamentos humanos', 'Transformação pessoal'],
        noiteConteudo: `Você sabe o que é o inconsciente?\n\nNão é mistério. Não é coisa de filme.\n\nÉ a parte da sua mente que guia suas decisões, suas reações e seus padrões — sem você perceber.\n\nEm ${warmupDays - 2} dias, você vai entender como isso funciona.\n\nFaltam *${warmupDays - 2} dias*.`,
      },
      // Dia 4 — O que você está evitando
      {
        manhaTema: `*O que você está evitando olhar em você mesmo?*\n\nNão precisa responder agora. Mas guarda essa pergunta.\n\nTudo aquilo que não encaramos de frente continua agindo por trás — nos sabotando, nos limitando, nos fazendo repetir os mesmos erros.\n\nFaltam *${warmupDays - 3} dias*.`,
        manhaEmoji: '🔥',
        tardeIntro: 'A pergunta de hoje vai fundo:',
        pollNome: 'O que você mais sente que precisa hoje?',
        pollOps: ['Clareza emocional', 'Autoconhecimento', 'Mudança real', 'Entender meus padrões'],
        noiteConteudo: `Por que você reage do jeito que reage?\nPor que você se apaixona por quem se apaixona?\nPor que você sabota exatamente quando estava quase chegando lá?\n\nEssas respostas estão dentro de você. E em ${warmupDays - 3} dias, você vai encontrá-las.\n\nFaltam *${warmupDays - 3} dias*.`,
      },
      // Dia 5 — Por que você é assim
      {
        manhaTema: `Tem uma pergunta que é a mais poderosa do autoconhecimento:\n\n*Por que eu sou assim?*\n\nNão como crítica. Como curiosidade genuína de quem quer se entender de verdade.\n\nA maioria das pessoas passa a vida tentando mudar sem nunca fazer essa pergunta.\n\nFaltam *${warmupDays - 4} dias*.`,
        manhaEmoji: '❤️',
        tardeIntro: 'Enquete de hoje — qual situação mais te representa:',
        pollNome: 'Qual situação mais te representa hoje?',
        pollOps: ['Sinto que preciso mudar', 'Me sinto emocionalmente cansado', 'Quero me entender melhor', 'Cansei de repetir padrões'],
        noiteConteudo: `Você não nasceu assim.\n\nMuitos dos comportamentos que hoje te limitam foram aprendidos — nas experiências que moldaram quem você é.\n\nE tudo que foi aprendido pode ser transformado.\n\nÉ exatamente isso que vai acontecer ao vivo, em ${warmupDays - 4} dias.\n\nFaltam *${warmupDays - 4} dias*.`,
      },
      // Dia 6 — 3 dias, visão geral das aulas
      {
        manhaTema: `3 aulas. 3 noites. Uma jornada que começa por dentro.\n\nCada aula foi desenhada para revelar uma camada diferente de você mesmo.\n\nNão existe momento certo para começar a se conhecer — mas existe o momento em que você decide que já chega.\n\nFaltam *3 dias*.`,
        manhaEmoji: '❤️',
        tardeIntro: 'O que você espera encontrar nessa jornada?',
        pollNome: 'O que você espera encontrar?',
        pollOps: ['Autoconhecimento', 'Transformação emocional', 'Respostas', 'Um novo começo'],
        noiteConteudo: `Existe uma diferença enorme entre conhecer alguém… e conhecer a si mesmo.\n\nA maioria das pessoas dedica anos tentando entender os outros — os conflitos, os relacionamentos, as rejeições.\n\nMas raramente para para perguntar: *O que isso diz sobre mim?*\n\nEm 3 dias, você vai encontrar essa resposta.\n\nFaltam *3 dias*.`,
      },
      // Dia 7 — 2 dias
      {
        manhaTema: `Entender o inconsciente pode mudar completamente a forma como você vive emoções, relacionamentos e decisões.\n\nNão porque você vai se tornar outra pessoa.\n\nMas porque você vai finalmente entender quem você é.\n\nFaltam *2 dias*.`,
        manhaEmoji: '🔥',
        tardeIntro: 'Quase lá. O que você mais espera das aulas ao vivo?',
        pollNome: 'O que você mais espera das aulas?',
        pollOps: ['Aprendizado profundo', 'Transformação imediata', 'Ferramentas práticas', 'Uma nova perspectiva'],
        noiteConteudo: `Quem já passou por uma experiência profunda de autoconhecimento costuma dizer a mesma coisa depois:\n\n*"Eu não sabia que precisava tanto disso."*\n\nO inconsciente decide por você antes de você perceber. Cria as reações que você não consegue controlar. Repete os padrões que você tanto quer quebrar.\n\nEm 2 dias, você vai entender como ressignificá-lo.\n\nFaltam *2 dias*.`,
      },
      // Dia 8 — Véspera
      {
        manhaTema: `A mudança que você quer não vem de mais esforço.\n\nVem de mais consciência.\n\nVocê pode se esforçar mais, tentar mais, fazer mais listas… Mas se os padrões inconscientes continuam operando do mesmo jeito — o resultado vai ser o mesmo.\n\nA jornada começa amanhã. *AMANHÃ. ${aulaH(1)}. AO VIVO.*\n\nFalta *1 dia*.`,
        manhaEmoji: '🔥',
        tardeIntro: 'Véspera. Última enquete antes da jornada começar:',
        pollNome: 'O que você mais quer levar dessa jornada?',
        pollOps: ['Autoconhecimento real', 'Quebrar padrões', 'Clareza emocional', 'Transformação de vida'],
        noiteConteudo: `Amanhã, às ${aulaH(1)}, começa a ${aulaTit(1)}.\n\nUma pergunta para você dormir pensando:\n\n*Como seria a sua vida se você entendesse completamente o que te move?*\n\nNão o que você acha. Não o que as pessoas dizem.\n\nO que de fato está por trás das suas escolhas, das suas reações, dos seus padrões.\n\nChega com caderno, caneta e coração aberto. *AMANHÃ. ${aulaH(1)}. AO VIVO.*\n\nFalta *1 dia*.`,
      },
    ];

    // ── Gerar dias de aquecimento ──────────────────────────────────────────────
    for (let i = 0; i < warmupDays; i++) {
      const day     = i + 1;
      const dayDate = addDays(warmupStart, i);
      const d       = dias[i];

      // Manhã (11h) — conteúdo + datas + CTA
      msgs.push(textMsg(fn, day, setTime(dayDate, '11:00'), g1,
        `Excelente dia! ☀️\n\n${d.manhaTema}\n\n${aulasDates()}\n\nReaja a essa mensagem com um ${d.manhaEmoji} se você vai estar ao vivo!\n\n👇 Deixe o like e ative o lembrete das aulas:\n${linkBlock()}`,
        `Dia ${day} — Manhã`, { link_preview: true }));

      // Tarde (17h) — intro da enquete
      msgs.push(textMsg(fn, day, setTime(dayDate, '17:00'), g1,
        `Excelente tarde! ☀️\n\n${d.tardeIntro}\n\n*${d.pollNome}*\n\n👇`,
        `Dia ${day} — Enquete (intro)`));

      // Tarde (17h03) — poll
      msgs.push(pollMsg(fn, day,
        new Date(setTime(dayDate, '17:00').getTime() + 3 * 60 * 1000),
        g1, d.pollNome, d.pollOps, `Dia ${day} — Enquete`));

      // Noite (23h) — contagem + CTA
      msgs.push(textMsg(fn, day, setTime(dayDate, '23:00'), g1,
        `Excelente noite! 🌙\n\n${d.noiteConteudo}\n\n${aulasDates()}\n\nReaja a essa mensagem com um ❤️ se você vai estar ao vivo!\n\n👇 Deixe o like e ative o lembrete das aulas:\n${linkBlock()}`,
        `Dia ${day} — Noite`, { link_preview: true }));
    }

    // ── Gerar dias de aula ─────────────────────────────────────────────────────
    for (let i = 1; i <= numAulas; i++) {
      const aulaDateStr = aula(i)?.data || config.data_live;
      const aulaDateObj = new Date(aulaDateStr + 'T12:00:00');
      const dayNum      = warmupDays + i;
      const aulaDateHora = setTime(aulaDateObj, aulaHora(i));

      // Manhã do dia da aula
      const manhaTxt = i === 1
        ? `Excelente dia! ☀️\n\n*HOJE É O DIA.*\n\nEssa noite, às ${aulaH(i)}, começa a ${aulaTit(i)}.\n\nChega com caderno, caneta e coração aberto.\n\n👇 Deixe o like e ative o lembrete:\n${aulaLink(i)}`
        : `Excelente dia! ☀️\n\nSe a aula de ontem te mexeu — prepara o coração.\n\n*Hoje vai mais fundo.*\n\n${aulaTit(i)} — ${aulaDia(i)}, ${aulaH(i)}.\n\n👇 ${aulaLink(i)}`;

      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '11:00'), g1, manhaTxt,
        `${aulaTit(i)} — Manhã`, { link_preview: true }));

      // Tarde — intro + enquete
      const tardeTxt = i === 1
        ? `Excelente tarde! ☀️\n\nHOJE ÀS ${aulaH(i)} — ${aulaTit(i)}! 🔴\n\nAntes de começar:\n\n*Qual é a sua maior expectativa para essa aula?*\n\n👇\n\n${aulaLink(i)}`
        : `Excelente tarde! ☀️\n\nDepois da aula de ontem, quero saber:\n\n*O que mais te pegou na ${aulaTit(i - 1)}?*\n\n👇\n\n${aulaLink(i)}`;

      msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '17:00'), g1, tardeTxt,
        `${aulaTit(i)} — Tarde`, { link_preview: true }));

      // Contagens regressivas — 3h, 2h, 1h antes
      for (const [offset, label] of [[-3, '3 HORAS'], [-2, '2 HORAS'], [-1, '1 HORA']] as [number, string][]) {
        const t = new Date(aulaDateHora.getTime() + offset * 60 * 60 * 1000);
        const txt = offset === -3
          ? `⏰ *Faltam ${label} para a ${aulaTit(i)}!*\n\nDaqui a pouco começa a aula mais importante da sua semana.\n\n👉 ${aulaLink(i)}`
          : offset === -2
          ? `⏰ *Faltam ${label}!*\n\nChecklist:\n✅ Caderno e caneta do lado\n✅ Fone de ouvido pronto\n✅ Lugar tranquilo garantido\n✅ Link salvo\n\nFalta só você aparecer.\n\n👉 ${aulaLink(i)}`
          : `⏰ *Falta ${label}!*\n\nReaja com um 🔥 se você vai estar lá!\n\n👉 ${aulaLink(i)}`;
        msgs.push(textMsg(fn, dayNum, t, g1, txt,
          `${aulaTit(i)} — -${Math.abs(offset)}h`,
          { link_preview: true, mention_everyone: true }));
      }

      // AO VIVO
      msgs.push(textMsg(fn, dayNum, aulaDateHora, g1,
        `🔴 *ESTAMOS AO VIVO!*\n\n${aulaTit(i)} começou AGORA!\n\nCorre. Não perde o início.\n\n👉 ${aulaLink(i)}\n\nReage com um ❤️ e entra AGORA!`,
        `${aulaTit(i)} — AO VIVO`,
        { link_preview: true, mention_everyone: true }));

      // Pós-aula (3h depois) — apenas entre aulas
      if (i < numAulas) {
        const pos = new Date(aulaDateHora.getTime() + 3 * 60 * 60 * 1000);
        msgs.push(textMsg(fn, dayNum, pos, g1,
          `✅ *${aulaTit(i)} encerrada!*\n\nEspero que tenham aproveitado!\n\n📹 Gravação disponível por 48h:\n${aulaLink(i)}\n\nNos vemos amanhã para a ${aulaTit(i + 1)}! 💪`,
          `${aulaTit(i)} — Pós-aula`, { link_preview: true }));
      }
    }

    // ── Oferta pós-evento ──────────────────────────────────────────────────────
    const diaOferta     = addDays(live, numAulas);
    const linkCheckout  = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';
    const baseDay       = warmupDays + numAulas;

    msgs.push(textMsg(fn, baseDay + 1, setTime(diaOferta, '10:00'), g2,
      `🎁 *Família, chegou o momento!*\n\nApós essas noites incríveis de conteúdo, as matrículas estão abertas.\n\n✨ Garanta sua vaga agora:\n${linkCheckout}\n\n⚠️ Vagas limitadas!`,
      'Oferta — Abertura', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 2, setTime(addDays(diaOferta, 1), '19:00'), g2,
      `⏳ *Ainda dá tempo!*\n\nAs matrículas ainda estão abertas — mas o prazo está acabando.\n\n🔗 ${linkCheckout}`,
      'Oferta — Follow-up +1', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 3, setTime(addDays(diaOferta, 2), '18:00'), g2,
      `🚨 *Último aviso!*\n\nAmanhã encerram as matrículas. Depois disso, não haverá nova turma tão cedo.\n\n🔗 ${linkCheckout}\n\nÉ agora ou nunca! 💪`,
      'Oferta — Escassez +2', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, baseDay + 4, setTime(addDays(diaOferta, 3), '12:00'), g2,
      `🔒 *Encerrando hoje!*\n\nHoje é o último dia. As matrículas fecham à meia-noite.\n\n🔗 ${linkCheckout}\n\nNão deixe pra depois — o depois pode não vir! 🎯`,
      'Oferta — Encerramento +3', { link_preview: true, mention_everyone: true }));

  // ═══════════════════════════════════════════════════════════════════════════
  // NPA
  // ═══════════════════════════════════════════════════════════════════════════
  } else {
    const warmupDays = 3;
    const warmupStart = addDays(live, -warmupDays);

    const diasNpa = [
      {
        manhaTema: `Você entrou em um grupo de pessoas que estão prontas para sair do piloto automático.\n\nEm ${warmupDays} dias, vamos ter um encontro ao vivo que vai te mostrar caminhos que você ainda não considerou.\n\nFaltam *${warmupDays} dias*.`,
        manhaEmoji: '❤️',
        tardeIntro: 'Enquete de boas-vindas:',
        pollNome: 'O que mais te trouxe até aqui?',
        pollOps: ['Busca por mudança', 'Curiosidade', 'Indicação', 'Quero me conhecer melhor'],
        noiteConteudo: `A maior parte das decisões que tomamos no dia a dia não é consciente.\n\nÉ o inconsciente que dirige — e a maioria das pessoas nunca para para entender isso.\n\nEm ${warmupDays} dias, vamos mudar isso juntos.\n\nFaltam *${warmupDays} dias*.`,
      },
      {
        manhaTema: `Faltam *2 dias* para o nosso encontro ao vivo.\n\nVocê já se perguntou por que repete os mesmos padrões, mesmo quando quer mudar?\n\nIsso tem uma explicação — e ela está no seu inconsciente.\n\nFaltam *2 dias*.`,
        manhaEmoji: '🔥',
        tardeIntro: 'Enquete de hoje:',
        pollNome: 'O que você mais quer levar desse encontro?',
        pollOps: ['Autoconhecimento', 'Clareza emocional', 'Mudança real', 'Entender meus padrões'],
        noiteConteudo: `Em 2 dias, vamos ter um encontro ao vivo que vai te ajudar a entender o que está por trás dos seus padrões e das suas escolhas.\n\nChega com abertura e vontade de se enxergar.\n\nFaltam *2 dias*.`,
      },
      {
        manhaTema: `Falta *1 dia* para o nosso encontro!\n\nAmanhã, às ${aulaH(1)}, vamos nos encontrar ao vivo para um conteúdo que vai fundo.\n\nChega preparado — com caderno, caneta e coração aberto.\n\n*AMANHÃ. ${aulaH(1)}. AO VIVO.*`,
        manhaEmoji: '🔥',
        tardeIntro: 'Última enquete antes do encontro:',
        pollNome: 'Como você está chegando para amanhã?',
        pollOps: ['Animado e preparado', 'Com muita expectativa', 'Ansioso mas pronto', 'Aberto para o que vier'],
        noiteConteudo: `Amanhã às ${aulaH(1)} começa.\n\nUma pergunta para você dormir pensando:\n\n*O que mudaria na sua vida se você entendesse completamente o que te move?*\n\nChega com caderno, caneta e coração aberto.\n\n*AMANHÃ. ${aulaH(1)}. AO VIVO.*\n\nFalta *1 dia*.`,
      },
    ];

    for (let i = 0; i < warmupDays; i++) {
      const day     = i + 1;
      const dayDate = addDays(warmupStart, i);
      const d       = diasNpa[i];

      msgs.push(textMsg(fn, day, setTime(dayDate, '11:00'), g1,
        `Excelente dia! ☀️\n\n${d.manhaTema}\n\n${aulasDates()}\n\nReaja a essa mensagem com um ${d.manhaEmoji} se você vai estar ao vivo!\n\n👇 Deixe o like e ative o lembrete:\n${linkBlock()}`,
        `Dia ${day} — Manhã`, { link_preview: true }));

      msgs.push(textMsg(fn, day, setTime(dayDate, '17:00'), g1,
        `Excelente tarde! ☀️\n\n${d.tardeIntro}\n\n*${d.pollNome}*\n\n👇`,
        `Dia ${day} — Enquete (intro)`));

      msgs.push(pollMsg(fn, day,
        new Date(setTime(dayDate, '17:00').getTime() + 3 * 60 * 1000),
        g1, d.pollNome, d.pollOps, `Dia ${day} — Enquete`));

      msgs.push(textMsg(fn, day, setTime(dayDate, '23:00'), g1,
        `Excelente noite! 🌙\n\n${d.noiteConteudo}\n\n${aulasDates()}\n\nReaja a essa mensagem com um ❤️ se você vai estar ao vivo!\n\n👇 Deixe o like e ative o lembrete:\n${linkBlock()}`,
        `Dia ${day} — Noite`, { link_preview: true }));
    }

    // Dia do evento NPA
    const aulaDateObj  = new Date(config.data_live + 'T12:00:00');
    const aulaDateHora = setTime(aulaDateObj, aulaHora(1));
    const dayNum       = warmupDays + 1;

    msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '11:00'), g1,
      `Excelente dia! ☀️\n\n*HOJE É O DIA.*\n\nEssa noite, às ${aulaH(1)}, começa o nosso encontro ao vivo.\n\nChega com caderno, caneta e coração aberto.\n\n👇 ${aulaLink(1)}`,
      'Dia do Evento — Manhã', { link_preview: true }));

    msgs.push(textMsg(fn, dayNum, setTime(aulaDateObj, '17:00'), g1,
      `Excelente tarde! ☀️\n\nHOJE ÀS ${aulaH(1)}! 🔴\n\nAntes de começar:\n\n*Qual é a sua maior expectativa para essa noite?*\n\n👇\n\n${aulaLink(1)}`,
      'Dia do Evento — Tarde', { link_preview: true }));

    msgs.push(textMsg(fn, dayNum,
      new Date(aulaDateHora.getTime() - 60 * 60 * 1000), g1,
      `⏰ *Falta 1 HORA!*\n\nReaja com um 🔥 se você vai estar lá!\n\n👉 ${aulaLink(1)}`,
      'Dia do Evento — -1h', { link_preview: true, mention_everyone: true }));

    msgs.push(textMsg(fn, dayNum, aulaDateHora, g1,
      `🔴 *ESTAMOS AO VIVO!*\n\nComeçou AGORA!\n\nCorre. Não perde o início.\n\n👉 ${aulaLink(1)}\n\nReage com um ❤️ e entra AGORA!`,
      'Dia do Evento — AO VIVO', { link_preview: true, mention_everyone: true }));

    // Oferta pós-NPA
    const diaOferta    = addDays(live, 1);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';

    msgs.push(textMsg(fn, dayNum + 1, setTime(diaOferta, '10:00'), g2,
      `🎁 *Olá, participante do evento!*\n\nEspero que tenha aproveitado cada minuto!\n\nConforme falamos, aqui estão os próximos passos para quem quer ir além:\n\n🔗 ${linkCheckout}\n\n⚠️ Vagas limitadas!`,
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

  // Para NPA: aliases semânticos por turma
  if (config.tipo === 'npa') {
    if (config.grupos[0]?.jid)  vars['grupo_manha']       = config.grupos[0].jid;
    if (config.grupos[0]?.link) vars['link_grupo_manha']  = config.grupos[0].link;
    if (config.grupos[1]?.jid)  vars['grupo_tarde']       = config.grupos[1].jid;
    if (config.grupos[1]?.link) vars['link_grupo_tarde']  = config.grupos[1].link;
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
  const g1 = config.grupos[0]?.jid || '{{link_grupo}}';
  return `Olá {{nome}}! 🎉\n\nSeja muito bem-vindo(a) ao ${config.nome}!\n\nAcesse o grupo exclusivo:\n${g1}\n\nNos vemos lá! 🚀`;
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
