/**
 * lancamento-templates.ts
 * Gera sequência padrão de mensagens para um lançamento ou NPA.
 * As variáveis {{...}} são resolvidas pelo funil-processar na hora do envio.
 */

export interface AulaConfig {
  data: string;   // 'YYYY-MM-DD'
  hora: string;   // 'HH:MM'
  link: string;
  professor: string;
}

export interface GrupoConfig {
  nickname: string;
  jid: string;
  /** Números com DDI+DDD a adicionar ao grupo após a criação */
  participantes?: string[];
}

export interface WizardConfig {
  // Etapa 1
  nome: string;
  tipo: 'lancamento' | 'npa';
  data_live: string;   // 'YYYY-MM-DD'
  hora_live: string;   // 'HH:MM'
  meta_leads: number;
  meta_matriculas: number;
  responsavel_id: string;

  // Etapa 2
  turma_destino_id: string;
  produto_destino: string;
  valor_mensalidade_destino: number;
  dia_vencimento_destino: number;
  total_mensalidades_destino: number;

  // Etapa 3
  quantidade_grupos: 1 | 2;
  grupos: GrupoConfig[];
  instancia_evolution: string;

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
  /** ISO string calculado a partir da data_live + offset */
  scheduled_at: string;
  recipient_type: 'group' | 'number';
  /** '{{grupo_1}}', '{{grupo_2}}' etc. */
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
  /** Label para o usuário identificar a mensagem na revisão */
  label: string;
  /** true = variável obrigatória que está vazia → deve ficar como rascunho */
  hasUnresolvedVar: boolean;
}

// Helpers
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

function toISO(d: Date): string {
  return d.toISOString();
}

function fmtDate(iso: string): string {
  if (!iso) return '{{data}}';
  const [y, mo, dy] = iso.split('-');
  return `${dy}/${mo}`;
}

function fmtDayWeek(iso: string): string {
  if (!iso) return '';
  const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return days[new Date(iso + 'T12:00:00').getDay()];
}

function checkVar(text: string): boolean {
  // Retorna true se alguma variável {{...}} ainda não foi resolvida
  // (ex: {{link_aula_1}} aparece no texto E o valor correspondente está vazio)
  return /\{\{[^}]+\}\}/.test(text);
}

function msg(
  day: number,
  scheduledAt: Date,
  recipientId: string,
  text: string,
  opts: Partial<TemplateMensagem> = {},
  label: string,
  funnel_name: string,
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
    funnel_name,
    label,
    hasUnresolvedVar: checkVar(text),
    ...opts,
  };
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export function generateLancamentoMessages(config: WizardConfig): TemplateMensagem[] {
  if (!config.data_live) return [];

  const live = new Date(config.data_live + 'T' + (config.hora_live || '20:00') + ':00');
  const fn = config.nome;
  const g1 = '{{grupo_1}}';
  const g2 = config.grupos.length >= 2 ? '{{grupo_2}}' : '{{grupo_1}}';

  const msgs: TemplateMensagem[] = [];

  // Pré-calcular variáveis de aulas para o texto
  const aula = (n: number) => config.aulas[n - 1];
  const aulaData = (n: number) => aula(n)?.data ? fmtDate(aula(n).data) : `{{data_aula_${n}}}`;
  const aulaDia  = (n: number) => aula(n)?.data ? fmtDayWeek(aula(n).data) : '';
  const aulaHora = (n: number) => aula(n)?.hora || `{{hora_aula_${n}}}`;
  const aulaLink = (n: number) => aula(n)?.link || `{{link_aula_${n}}}`;
  const aulaProfessor = (n: number) => aula(n)?.professor || `{{professor_${n}}}`;

  if (config.tipo === 'lancamento') {
    // ── Dia -7: Teaser ────────────────────────────────────────────────────────
    msgs.push(msg(-7, setTime(addDays(live, -7), '09:00'), g1,
      `☀️ *Bom dia, família!*\n\nPreparem-se — em 7 dias teremos uma semana especial com conteúdo incrível para vocês! 🚀\n\nFiquem ligados aqui no grupo. 👇`,
      { send_header_image: false }, 'Teaser Dia -7 (manhã)', fn));

    // ── Dia -5: Engajamento ───────────────────────────────────────────────────
    msgs.push(msg(-5, setTime(addDays(live, -5), '19:00'), g1,
      `💬 *Quero saber de vocês!*\n\nCom o que vocês mais querem crescer nos próximos meses?\n\nResponda aqui no grupo 👇`,
      { mention_everyone: true }, 'Engajamento Dia -5 (tarde)', fn));

    // ── Dia -3: Contagem regressiva ───────────────────────────────────────────
    msgs.push(msg(-3, setTime(addDays(live, -3), '20:00'), g1,
      `⏰ *Faltam 3 dias!*\n\nEstamos preparando algo especial para vocês. Não saiam do grupo e ativem as notificações! 🔔`,
      { send_header_image: true, subtipo: 'contagem_dia_3', mention_everyone: true },
      'Contagem Dia -3 (noite)', fn));

    // ── Dia -1: Amanhã começa ─────────────────────────────────────────────────
    msgs.push(msg(-1, setTime(addDays(live, -1), '19:00'), g1,
      `🔥 *Amanhã é o dia!*\n\nAmanhã começa a nossa semana de aulas ao vivo!\n\n📅 Aula 1: ${aulaData(1)}${aulaDia(1) ? ' (' + aulaDia(1) + ')' : ''} às ${aulaHora(1)}h\n👨‍🏫 Com ${aulaProfessor(1)}\n\nSeparalem um tempinho de qualidade para aproveitar ao máximo! 🎯`,
      { mention_everyone: true }, 'Amanhã começa! Dia -1', fn));

    // ── Dia 0: Hoje é o dia (manhã) ────────────────────────────────────────────
    msgs.push(msg(0, setTime(live, '09:00'), g1,
      `🌟 *Hoje é o dia, família!*\n\nHoje começa a nossa semana de transformação!\n\n⏰ Aula 1 — ${aulaData(1)} às ${aulaHora(1)}h\n👨‍🏫 ${aulaProfessor(1)}\n\n🔗 Acesse: ${aulaLink(1)}\n\nNos vemos lá! 🚀`,
      { link_preview: true, mention_everyone: true }, 'Hoje é o dia! Dia 0 (manhã)', fn));

    // ── Por cada aula ─────────────────────────────────────────────────────────
    const numAulas = Math.min(config.aulas.length, 3);
    for (let i = 1; i <= numAulas; i++) {
      const aulaDate = aula(i)?.data || config.data_live;
      const aulaDateObj = new Date(aulaDate + 'T12:00:00');

      // 1h antes
      msgs.push(msg(i * 10, setTime(aulaDateObj, aulaHora(i)).valueOf()
        ? new Date(setTime(aulaDateObj, aulaHora(i)).getTime() - 60 * 60 * 1000)
        : setTime(addDays(live, i - 1), '18:00'),
        g1,
        `⏰ *Daqui a 1 hora — Aula ${i}!*\n\n📚 *${fn}*\nCom ${aulaProfessor(i)}\n\n🔗 Link: ${aulaLink(i)}\n\nAbra agora e deixe carregando! 👇`,
        { link_preview: true, mention_everyone: true, send_header_image: true, subtipo: `contagem_${i}h` },
        `Aula ${i} — 1h antes`, fn));

      // Na hora
      msgs.push(msg(i * 10 + 1, setTime(aulaDateObj, aulaHora(i)), g1,
        `🔴 *AO VIVO AGORA — Aula ${i}!*\n\n👨‍🏫 ${aulaProfessor(i)}\n\n🎯 Acesse agora:\n${aulaLink(i)}\n\nNos vemos lá! 🚀`,
        { link_preview: true, mention_everyone: true, send_header_image: true, subtipo: `aula_${i}` },
        `Aula ${i} — AO VIVO`, fn));

      // Pós-aula (3h depois)
      const posAula = new Date(setTime(aulaDateObj, aulaHora(i)).getTime() + 3 * 60 * 60 * 1000);
      msgs.push(msg(i * 10 + 2, posAula, g1,
        `✅ *Aula ${i} encerrada!*\n\nEspero que tenham aproveitado muito!\n\n📹 Gravação disponível (por 48h):\n${aulaLink(i)}\n\nNos vemos na próxima aula! 💪`,
        { link_preview: true }, `Pós-Aula ${i} — Gravação`, fn));
    }

    // ── Oferta (D+1 após última aula) ─────────────────────────────────────────
    const diaOferta = addDays(live, numAulas);
    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';
    msgs.push(msg(50, setTime(diaOferta, '10:00'), g2,
      `🎁 *Família, chegou o momento!*\n\nApós esses dias incríveis de conteúdo, abriu as matrículas para quem quer ir além!\n\n✨ *O que você recebe:*\n• Acesso completo ao curso\n• Suporte direto com a equipe\n• Comunidade exclusiva\n\n🔗 Garanta sua vaga:\n${linkCheckout}\n\n⚠️ Vagas limitadas!`,
      { link_preview: true, mention_everyone: true }, 'Mensagem de Oferta', fn));

    // Pós +1
    msgs.push(msg(51, setTime(addDays(diaOferta, 1), '19:00'), g2,
      `⏳ *Ainda dá tempo!*\n\nAs matrículas ainda estão abertas, mas o prazo está acabando.\n\n🔗 ${linkCheckout}\n\nQualquer dúvida, me chama aqui no grupo! 💬`,
      { link_preview: true, mention_everyone: true }, 'Follow-up Oferta +1', fn));

    // Pós +2
    msgs.push(msg(52, setTime(addDays(diaOferta, 2), '18:00'), g2,
      `🚨 *Último aviso!*\n\nAmanhã encerram as matrículas. Depois disso, não haverá nova turma tão cedo.\n\n🔗 ${linkCheckout}\n\nÉ agora ou nunca! 💪`,
      { link_preview: true, mention_everyone: true }, 'Escassez Oferta +2', fn));

    // Pós +3
    msgs.push(msg(53, setTime(addDays(diaOferta, 3), '12:00'), g2,
      `🔒 *Encerrando hoje!*\n\nHoje é o último dia. As matrículas fecham à meia-noite.\n\n🔗 ${linkCheckout}\n\nNão deixe pra depois — o depois pode não vir! 🎯`,
      { link_preview: true, mention_everyone: true }, 'Encerramento Oferta +3', fn));

  } else {
    // ── NPA: sequência mais curta ─────────────────────────────────────────────

    msgs.push(msg(-3, setTime(addDays(live, -3), '09:00'), g1,
      `📣 *Atenção, família!*\n\nFaltam 3 dias para o nosso evento especial!\n\n📅 Data: ${aulaData(1)}${aulaDia(1) ? ' (' + aulaDia(1) + ')' : ''}\n⏰ Horário: ${aulaHora(1)}h\n\nConfirmem presença respondendo aqui! 👇`,
      { mention_everyone: true }, 'NPA — Aviso Dia -3', fn));

    msgs.push(msg(-1, setTime(addDays(live, -1), '19:00'), g1,
      `⏰ *Amanhã é o evento!*\n\nEstão todos prontos? 🎯\n\n📅 ${aulaData(1)} às ${aulaHora(1)}h\n👨‍🏫 Com ${aulaProfessor(1)}\n\nNos vemos lá! 🚀`,
      { mention_everyone: true }, 'NPA — Lembrete Dia -1', fn));

    msgs.push(msg(0, setTime(live, '09:00'), g1,
      `🌟 *Hoje é o dia do evento!*\n\n⏰ Começa às ${aulaHora(1)}h\n🔗 Link: ${aulaLink(1)}\n\nSe preparem e chegem no horário! 💪`,
      { link_preview: true, mention_everyone: true, send_header_image: true, subtipo: 'ao_vivo' },
      'NPA — Dia do Evento (manhã)', fn));

    msgs.push(msg(1, setTime(live, aulaHora(1)), g1,
      `🔴 *COMEÇANDO AGORA!*\n\n${aulaLink(1)}\n\nEntra e fala olá! 👋`,
      { link_preview: true, mention_everyone: true, send_header_image: true, subtipo: 'ao_vivo' },
      'NPA — AO VIVO', fn));

    const linkCheckout = config.links_extras.find(l => l.key === 'link_checkout')?.value || '{{link_checkout}}';
    msgs.push(msg(2, setTime(addDays(live, 1), '10:00'), g2,
      `🎁 *Olá, participante do evento!*\n\nEspero que tenha gostado! Conforme falamos, aqui estão os próximos passos:\n\n🔗 Garanta seu acesso:\n${linkCheckout}`,
      { link_preview: true, mention_everyone: true }, 'NPA — Oferta Pós-Evento', fn));
  }

  // Marca como draft se tiver variável não resolvida
  return msgs.map(m => ({
    ...m,
    status: m.hasUnresolvedVar ? 'draft' : 'scheduled',
  }));
}

// ─── Helpers para resolver variáveis do wizard ────────────────────────────────

/** Monta o objeto variaveis para salvar em funnel_configs */
export function buildFunnelVariaveis(config: WizardConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  // Grupos
  config.grupos.forEach((g, i) => {
    if (g.jid) vars[`grupo_${i + 1}`] = g.jid;
  });

  // Aulas
  config.aulas.forEach((a, i) => {
    const n = i + 1;
    if (a.data) vars[`data_aula_${n}`] = fmtDate(a.data);
    if (a.hora) vars[`hora_aula_${n}`] = a.hora;
    if (a.link) vars[`link_aula_${n}`] = a.link;
    if (a.professor) vars[`professor_${n}`] = a.professor;
  });

  // Links extras
  config.links_extras.forEach(({ key, value }) => {
    if (key && value) vars[key] = value;
  });

  return vars;
}

/** Template padrão de boas-vindas WPP */
export function defaultBoasVindasWpp(config: WizardConfig): string {
  const g1 = config.grupos[0]?.jid || '{{link_grupo}}';
  return `Olá {{nome}}! 🎉\n\nSeja muito bem-vindo(a) ao ${config.nome}!\n\nAcesse o grupo exclusivo:\n${g1}\n\nNos vemos lá! 🚀`;
}

/** Template padrão de boas-vindas Email */
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
