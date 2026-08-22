import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase edge runtime expõe EdgeRuntime pra background tasks
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// CORS aberto — Evolution API chama de servidor externo
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits.slice(-11);
}

// Opt-out global de WhatsApp -- heuristica best-effort (mesmo espirito das outras
// deteccoes por texto deste arquivo, ex: extractText). Palavras curtas e genericas
// só contam como opt-out quando são a mensagem inteira (padrão "STOP" de SMS/WhatsApp),
// pra não confundir "vou parar de estudar" com pedido de sair da lista. Frases mais
// específicas casam como substring em qualquer lugar da mensagem.
const OPT_OUT_PALAVRAS_EXATAS = ['parar', 'pare', 'stop', 'sair', 'cancelar', 'descadastrar', 'descadastre', 'remover'];
const OPT_OUT_FRASES = [
  'para de mandar', 'pare de mandar', 'para de enviar', 'pare de enviar',
  'para de me mandar', 'pare de me mandar', 'nao manda mais', 'nao mandem mais',
  'nao quero mais receber', 'nao quero mais mensagem', 'nao quero mais msg',
  'me tira dessa lista', 'me tira da lista', 'me remove dessa lista', 'me remove da lista',
  'tira meu numero', 'remove meu numero', 'sair da lista', 'cancelar inscricao',
];

function normalizarTextoOptOut(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function detectarOptOut(mensagem: string): boolean {
  const t = normalizarTextoOptOut(mensagem);
  if (!t) return false;
  if (OPT_OUT_PALAVRAS_EXATAS.includes(t)) return true;
  return OPT_OUT_FRASES.some(frase => t.includes(frase));
}

async function registrarOptOut(supabase: any, telefone: string, mensagem: string): Promise<void> {
  const { error } = await supabase.from('whatsapp_opt_out').upsert({
    telefone,
    origem: 'evo-resposta',
    gatilho: mensagem.slice(0, 300),
  }, { onConflict: 'telefone' });
  if (error) console.error(`falha ao registrar opt-out telefone=${telefone}:`, error.message);
  else console.log(`opt-out registrado para telefone=${telefone}`);
}

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// Historico de conversa (tabela whatsapp_mensagens) -- alimenta a aba Chat.
// Best-effort: erro aqui nunca pode impedir o resto do processamento da
// resposta (opt-out, matching por tabela, notificacao dos admins).
async function registrarMensagemRecebida(
  supabase: ReturnType<typeof createClient>,
  telefone: string,
  conteudo: string,
  tipo: string,
  instance: string,
): Promise<void> {
  try {
    const { error } = await supabase.from('whatsapp_mensagens').insert({
      telefone,
      direcao: 'recebida',
      conteudo,
      tipo,
      origem: 'inbound',
      evolution_instance: instance || null,
    });
    if (error) console.error('registrarMensagemRecebida:', error.message);
  } catch (e: unknown) {
    console.error('registrarMensagemRecebida falhou:', (e as Error).message);
  }
}

// Historico de conversa pro lado "enviada" quando a mensagem saiu do numero
// conectado (fromMe=true). Duas origens possiveis pro mesmo evento:
// 1) Echo de um envio que uma das 4 funcoes (disparo-runner/boas-vindas-enviar/
//    enviar-cobranca/funil-processar) ja gravou direto -- essas preenchem
//    evolution_message_id, entao a gente so pula se already existe.
// 2) Mensagem mandada NA MAO pelo WhatsApp Web/app do numero conectado --
//    nenhuma das 4 funcoes roda pra esse caso, sem isso aqui nunca aparecia
//    no Chat.
async function registrarMensagemManualSeNova(
  supabase: ReturnType<typeof createClient>,
  telefone: string,
  conteudo: string,
  tipo: string,
  instance: string,
  messageId: string | null,
): Promise<void> {
  try {
    if (messageId) {
      const { data: existente } = await supabase
        .from('whatsapp_mensagens')
        .select('id')
        .eq('evolution_message_id', messageId)
        .maybeSingle();
      if (existente) return;
    }
    const { error } = await supabase.from('whatsapp_mensagens').insert({
      telefone,
      direcao: 'enviada',
      conteudo,
      tipo,
      origem: 'manual',
      evolution_instance: instance || null,
      evolution_message_id: messageId,
    });
    if (error) console.error('registrarMensagemManualSeNova:', error.message);
  } catch (e: unknown) {
    console.error('registrarMensagemManualSeNova falhou:', (e as Error).message);
  }
}

type EvoInstance = { id: string; api_url: string; api_key: string; instance_name: string };

async function isInstanceConnected(inst: EvoInstance): Promise<boolean> {
  const rawBase = inst.api_url.replace(/\/$/, '');
  const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  try {
    const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { instance?: { state?: string } };
    return data.instance?.state === 'open';
  } catch {
    return false;
  }
}

// ── Follow-up "respondeu ao áudio" (Semana do Despertar) ────────────────────
// Boas-vindas dos funis "Semana do Despertar" (tudo que não é NPA, ver
// tipoFunilBV no front) manda um ÁUDIO de boas-vindas. Quando o lead responde
// pela primeira vez, dispara pro mesmo número o texto já cadastrado em
// boas_vindas_config.wpp_mensagem (hoje só usado no e-mail pra esse tipo de
// funil -- nunca ia pro WhatsApp porque o endpoint de áudio não aceita texto
// junto) com o link do grupo + das 3 aulas, puxados de funnel_configs.
// A instância "ig" nunca pode disparar esse follow-up.
const INSTANCIA_PROIBIDA_FOLLOWUP = 'ig';

async function dispararFollowUpAudio(
  supabase: ReturnType<typeof createClient>,
  log: { funnel_name: string; whatsapp: string | null; nome: string | null; email: string | null },
  phoneFallback: string,
): Promise<void> {
  try {
    const { data: cfg } = await supabase
      .from('boas_vindas_config')
      .select('ativo, wpp_ativo, wpp_message_type, wpp_mensagem, wpp_instance_name')
      .eq('funnel_name', log.funnel_name)
      .maybeSingle();

    if (!cfg?.ativo || !cfg.wpp_ativo || cfg.wpp_message_type !== 'audio' || !cfg.wpp_mensagem) return;

    const { data: funnelCfg } = await supabase
      .from('funnel_configs')
      .select('grupo_1_id, grupo_2_id, variaveis')
      .eq('funnel_name', log.funnel_name)
      .maybeSingle();

    const vars: Record<string, string> = {
      nome: log.nome ?? '',
      turma: log.funnel_name,
      whatsapp: log.whatsapp ?? phoneFallback,
      email: log.email ?? '',
      grupo_1: funnelCfg?.grupo_1_id ?? '',
      grupo_2: funnelCfg?.grupo_2_id ?? '',
      ...(funnelCfg?.variaveis as Record<string, string> | undefined ?? {}),
    };
    const mensagem = applyVars(cfg.wpp_mensagem, vars);

    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('id, api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true });

    const semIg = ((evoRows ?? []) as EvoInstance[])
      .filter(r => r.instance_name.toLowerCase() !== INSTANCIA_PROIBIDA_FOLLOWUP);
    if (!semIg.length) {
      console.error(`follow-up audio: nenhuma instância disponível (fora "${INSTANCIA_PROIBIDA_FOLLOWUP}") funil=${log.funnel_name}`);
      return;
    }

    let candidatas = semIg;
    if (cfg.wpp_instance_name && cfg.wpp_instance_name.toLowerCase() !== INSTANCIA_PROIBIDA_FOLLOWUP) {
      const scoped = semIg.filter(r => r.instance_name === cfg.wpp_instance_name);
      if (scoped.length) candidatas = scoped;
    } else {
      const { data: taskCfg } = await supabase
        .from('evolution_task_config')
        .select('instance_ids')
        .eq('task', 'boas_vindas')
        .maybeSingle();
      if (taskCfg?.instance_ids?.length) {
        const byId = new Map(semIg.map(i => [i.id, i]));
        const scoped = (taskCfg.instance_ids as string[]).map(id => byId.get(id)).filter(Boolean) as EvoInstance[];
        if (scoped.length) candidatas = scoped;
      }
    }

    const conectadas = await Promise.all(candidatas.map(isInstanceConnected));
    const ativas = candidatas.filter((_, i) => conectadas[i]);
    if (!ativas.length) {
      console.error(`follow-up audio: nenhuma instância conectada funil=${log.funnel_name}`);
      return;
    }

    const number = (log.whatsapp ?? phoneFallback).replace(/\D/g, '');
    for (const inst of ativas) {
      const rawBase = inst.api_url.replace(/\/$/, '');
      const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
      try {
        const res = await fetch(`${base}/message/sendText/${encodeURIComponent(inst.instance_name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number, text: mensagem, delay: 1200 }),
        });
        if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)}`);
        console.log(`follow-up audio enviado funil=${log.funnel_name} instance=${inst.instance_name}`);
        return;
      } catch (e) {
        console.error(`follow-up audio falhou instance=${inst.instance_name}:`, (e as Error).message);
      }
    }
  } catch (e: unknown) {
    console.error('dispararFollowUpAudio fatal:', (e as Error).message);
  }
}

function extractText(message: Record<string, unknown>): { text: string; tipo: string } {
  if (message.conversation)
    return { text: String(message.conversation), tipo: 'text' };
  if ((message.extendedTextMessage as Record<string, unknown>)?.text)
    return { text: String((message.extendedTextMessage as Record<string, unknown>).text), tipo: 'text' };
  if (message.imageMessage)
    return { text: (message.imageMessage as Record<string, unknown>).caption as string ?? '[imagem]', tipo: 'image' };
  if (message.videoMessage)
    return { text: (message.videoMessage as Record<string, unknown>).caption as string ?? '[vídeo]', tipo: 'video' };
  if (message.audioMessage)
    return { text: '[áudio]', tipo: 'audio' };
  if (message.documentMessage)
    return { text: (message.documentMessage as Record<string, unknown>).fileName as string ?? '[documento]', tipo: 'document' };
  if (message.stickerMessage)
    return { text: '[sticker]', tipo: 'sticker' };
  return { text: '[mensagem]', tipo: 'unknown' };
}

// ── IA de cobrança: aciona cobranca-ia-responder quando um aluno responde ───
// Bloco isolado, sem relação com o follow-up de áudio acima. Dispara o agente
// de IA (supabase/functions/cobranca-ia-responder) só quando o telefone bateu
// com uma linha de cobranca_logs que tem aluno_id preenchido -- esse é o
// único proxy hoje pra "aluno de verdade no sistema" (as outras 3 tabelas de
// lead casadas acima não são aluno-específicas). Nunca é chamado pra grupo
// (já descartado no topo do handler) nem pra mensagens não-texto.
type CobrancaLogComAluno = {
  id: string; telefone: string; aluno_id: string | null; aluno_nome: string | null;
  pagamento_id: string | null; created_at: string;
};

async function tentarAcionarIaCobranca(
  supabase: ReturnType<typeof createClient>,
  cobrancaLogs: CobrancaLogComAluno[],
  phone: string,
  mensagem: string,
  instance: string,
): Promise<void> {
  try {
    const comAluno = cobrancaLogs.filter(l => l.aluno_id);
    if (!comAluno.length) return;

    // Se o telefone bateu com mais de um log, usa o mais recente.
    const escolhido = comAluno.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

    // Toggle "Resposta da IA" por aluno (independente de cobranca_ativa, que só controla
    // a cobrança automática) -- aluno com IA desligada continua só com respondeu_em
    // atualizado (já feito antes desse bloco), sem abrir conversa de IA.
    const { data: alunoCfg } = await supabase
      .from('alunos')
      .select('cobranca_ia_ativa')
      .eq('id', escolhido.aluno_id)
      .maybeSingle();
    if (alunoCfg && alunoCfg.cobranca_ia_ativa === false) return;

    const { data: optOut } = await supabase
      .from('whatsapp_opt_out')
      .select('telefone')
      .eq('telefone', phone)
      .maybeSingle();
    if (optOut) return;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const res = await fetch(`${supabaseUrl}/functions/v1/cobranca-ia-responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        aluno_id: escolhido.aluno_id,
        telefone: phone,
        mensagem,
        evolution_instance: instance,
        cobranca_log_id: escolhido.id,
      }),
    });
    if (!res.ok) {
      console.error(`cobranca-ia-responder respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  } catch (e: unknown) {
    console.error('tentarAcionarIaCobranca: falha ao acionar cobranca-ia-responder:', (e as Error).message);
  }
}

// ── NPA order bump: captura dados do convidado (2º ingresso) ────────────────
// vega-webhook marca aguardando_dados_convidado=true e pede "nome, whatsapp"
// numa mensagem só quando a compra inclui o order bump "+1 Ingresso ... PARA
// SEU CONVIDADO". Aqui a gente reconhece um telefone na resposta (10-11
// dígitos, com ou sem DDI/separadores) e trata o resto do texto como nome.
async function enviarTextoSimples(
  supabase: ReturnType<typeof createClient>,
  instanceName: string,
  number: string,
  text: string,
): Promise<void> {
  try {
    const { data: evo } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('instance_name', instanceName)
      .eq('ativo', true)
      .maybeSingle();
    if (!evo) return;
    const rawBase = (evo.api_url as string).replace(/\/$/, '');
    const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    await fetch(`${base}/message/sendText/${encodeURIComponent(evo.instance_name as string)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
      body: JSON.stringify({ number, text, delay: 1200 }),
    });
  } catch (e: unknown) {
    console.error('enviarTextoSimples: falha:', (e as Error).message);
  }
}

async function tentarCapturarDadosConvidado(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  s8: string,
  mensagem: string,
  mensagemTipo: string,
  instance: string,
): Promise<{ ok: true } | null> {
  if (mensagemTipo !== 'text') return null;
  try {
    const { data: lead } = await supabase
      .from('npa_evento_leads')
      .select('id')
      .eq('aguardando_dados_convidado', true)
      .filter('whatsapp', 'ilike', `%${s8}`)
      .order('bv_enviado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lead) return null;

    const numero = `${phone}@whatsapp.net`;
    const phoneMatch = mensagem.match(/(\d[\d\s().-]{8,14}\d)/);
    const telefoneConvidado = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '';

    if (!telefoneConvidado || telefoneConvidado.length < 10) {
      await enviarTextoSimples(supabase, instance, numero,
        'Não consegui identificar o WhatsApp do seu convidado nessa mensagem 🙏\n\nPode mandar de novo assim: *Nome completo, WhatsApp com DDD*\nEx.: João Silva, 11987654321');
      return { ok: true };
    }

    const nomeConvidado = mensagem
      .replace(phoneMatch![0], '')
      .replace(/[,\-–]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Convidado';

    await supabase.from('npa_evento_leads').update({
      convidado_nome: nomeConvidado,
      convidado_whatsapp: telefoneConvidado,
      aguardando_dados_convidado: false,
    }).eq('id', lead.id);

    await enviarTextoSimples(supabase, instance, numero,
      `Perfeito! Ingresso extra confirmado para *${nomeConvidado}* ✅\n\nQualquer dúvida, é só chamar!`);

    console.log(`tentarCapturarDadosConvidado: lead=${lead.id} convidado="${nomeConvidado}"`);
    return { ok: true };
  } catch (e: unknown) {
    console.error('tentarCapturarDadosConvidado: falha:', (e as Error).message);
    return null;
  }
}

// ── Lead direto do anúncio IDM: aciona leads-ia-responder ───────────────────
// Bloco isolado, roda ANTES do matching pelas 4 tabelas abaixo -- é um sinal
// mais específico (texto exato do botão de WhatsApp Ads da Formação em
// Psicanálise Integrativa) do que um simples telefone batendo numa planilha.
// Reaproveita lead existente (origem='Direto') se o mesmo número já mandou
// essa mensagem antes (ex.: reabriu o botão do anúncio de novo), senão cria.
// Ver supabase/functions/leads-ia-responder.
const GATILHOS_ANUNCIO_IDM = [
  'olá! quero receber informações sobre a formação em psicanálise integrativa do idm.',
];

async function tentarCriarLeadDireto(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  mensagem: string,
  mensagemTipo: string,
  instance: string,
  pushName: string,
): Promise<{ ok: true; lead_id: string } | null> {
  if (mensagemTipo !== 'text') return null;

  // SDR de IA desativado por flag (decisão do usuário: atendimento passou a
  // ser 100% humano via vendedores, ver lead_aquecimento_*) -- não cria lead
  // Direto nem aciona leads-ia-responder. Código intacto pra religar depois.
  const { data: sdrCfg } = await supabase
    .from('leads_ia_config')
    .select('ativo')
    .eq('id', 'default')
    .maybeSingle();
  if (sdrCfg && sdrCfg.ativo === false) return null;

  const s8 = phone.slice(-8);
  const normalizado = mensagem.trim().toLowerCase();
  const ehGatilho = GATILHOS_ANUNCIO_IDM.includes(normalizado);

  try {
    let lead: { id: string; nome: string } | null = null;

    if (ehGatilho) {
      // Mensagem exata do anúncio -- reaproveita lead existente (origem='Direto')
      // ou cria um novo.
      const { data: existente } = await supabase
        .from('leads')
        .select('id, nome')
        .eq('origem', 'Direto')
        .filter('telefone', 'ilike', `%${s8}`)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existente) {
        lead = existente as { id: string; nome: string };
      } else {
        const { data: novo, error: insertErr } = await supabase
          .from('leads')
          .insert({
            nome: pushName || `Lead WhatsApp ${s8}`,
            telefone: phone,
            whatsapp: phone,
            origem: 'Direto',
            produto: 'direto',
            status: 'novo',
            valor_potencial: 997,
            ultima_atividade: new Date().toISOString(),
          })
          .select('id, nome')
          .single();
        if (insertErr) {
          console.error('tentarCriarLeadDireto: falha ao criar lead:', insertErr.message);
          return null;
        }
        lead = novo as { id: string; nome: string };
      }
    } else {
      // Não é a mensagem-gatilho -- só continua se esse telefone já tiver uma
      // conversa de SDR ABERTA (senão não é assunto nosso, cai no matching
      // genérico abaixo). É isso que faz o SDR responder a segunda, terceira
      // mensagem do lead, não só a primeira.
      const { data: conversaAberta } = await supabase
        .from('leads_ia_conversas')
        .select('lead_id')
        .eq('status', 'ativo')
        .filter('telefone', 'ilike', `%${s8}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conversaAberta) {
        // Sem conversa ativa em leads_ia_conversas -- mas pode ser a 2a/3a
        // mensagem rápida de um lead cuja 1a mensagem ainda está no buffer de
        // debounce (leads_ia_conversas só é criada quando o debounce dispara
        // o leads-ia-responder, alguns segundos depois). Sem este check, uma
        // mensagem rápida em sequência (ex.: "Din" + "Sim" 3s depois) cairia
        // no matching genérico abaixo e seria ignorada em vez de entrar no buffer.
        const { data: bufferPendente } = await supabase
          .from('leads_ia_debounce')
          .select('lead_id')
          .filter('telefone', 'ilike', `%${s8}`)
          .maybeSingle();
        if (bufferPendente) {
          lead = { id: bufferPendente.lead_id, nome: '' };
        }
      }
      if (!conversaAberta && !lead) {
        // Sem conversa ativa -- mas pode ser um lead Direto já em handoff
        // (aguardando_humano), cujas respostas não batem em nenhuma das 4
        // tabelas do matching genérico abaixo (não são lead de lançamento,
        // disparo, boas-vindas nem cobrança). Sem isso ninguém seria avisado
        // quando esse lead responder de novo enquanto espera o time.
        const { data: conversaHandoff } = await supabase
          .from('leads_ia_conversas')
          .select('lead_nome')
          .eq('status', 'aguardando_humano')
          .filter('telefone', 'ilike', `%${s8}`)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (conversaHandoff && !(conversaHandoff.lead_nome ?? '').startsWith('TESTE')) {
          await supabase.rpc('notificar_vendedores_ativos', {
            p_tipo: 'lead_quente_ia',
            p_titulo: `💬 ${conversaHandoff.lead_nome || 'Lead'} respondeu de novo`,
            p_descricao: mensagem.slice(0, 200),
            p_link: '/pipeline',
          });
        }
        return null;
      }

      if (conversaAberta) {
        const { data: leadRow } = await supabase
          .from('leads')
          .select('id, nome')
          .eq('id', conversaAberta.lead_id)
          .maybeSingle();
        lead = leadRow as { id: string; nome: string } | null;
      }
    }
    if (!lead) return null;

    await acionarLeadsIaComDebounce(supabase, lead.id, phone, mensagem, instance);
    return { ok: true, lead_id: lead.id };
  } catch (e: unknown) {
    console.error('tentarCriarLeadDireto: falha:', (e as Error).message);
    return null;
  }
}

// ── Debounce de mensagens rápidas em sequência ──────────────────────────────
// Um lead que manda 2-3 mensagens em poucos segundos (ex.: "Din" seguido de
// "Sim" 3s depois) fazia o webhook disparar leads-ia-responder duas vezes em
// paralelo -- cada chamada gerava e mandava uma resposta sem saber da outra,
// resultando em respostas sobrepostas/perdidas no WhatsApp da lead. Em vez de
// chamar leads-ia-responder na hora, empilha a mensagem num buffer por telefone
// e espera DEBOUNCE_MS em background (EdgeRuntime.waitUntil, não trava o ack
// do webhook pra Evolution API); só quem ainda é a mensagem mais recente
// depois da espera (marcador bate) processa o buffer inteiro de uma vez.
const DEBOUNCE_MS = 6000;

async function acionarLeadsIaComDebounce(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  phone: string,
  mensagem: string,
  instance: string,
): Promise<void> {
  const { data: bufferAtual } = await supabase
    .from('leads_ia_debounce')
    .select('mensagens, em_processamento')
    .eq('telefone', phone)
    .maybeSingle();
  // Se o buffer atual já está sendo processado (chamada em andamento pro
  // leads-ia-responder), essa mensagem nova NÃO entra na leva que já foi
  // capturada -- começa um buffer novo, que debounça por conta própria. Sem
  // isso, uma mensagem chegando durante o processamento (Gemini + envio, que
  // pode levar alguns segundos) ficaria perdida no vácuo entre o buffer ser
  // limpo e a conversa ainda não existir em leads_ia_conversas.
  const mensagensAcumuladas = bufferAtual && !bufferAtual.em_processamento && Array.isArray(bufferAtual.mensagens)
    ? bufferAtual.mensagens : [];
  const marcador = crypto.randomUUID();

  const { error: upsertErr } = await supabase.from('leads_ia_debounce').upsert({
    telefone: phone,
    lead_id: leadId,
    evolution_instance: instance,
    mensagens: [...mensagensAcumuladas, mensagem],
    marcador,
    em_processamento: false,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'telefone' });
  if (upsertErr) {
    console.error('acionarLeadsIaComDebounce: falha ao gravar buffer:', upsertErr.message);
    return;
  }

  const task = (async () => {
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
    const { data: bufferFinal } = await supabase
      .from('leads_ia_debounce')
      .select('marcador, mensagens')
      .eq('telefone', phone)
      .maybeSingle();
    // Chegou mensagem mais nova durante a espera -- quem processa é a próxima chamada.
    if (!bufferFinal || bufferFinal.marcador !== marcador) return;

    // Marca como "em processamento" (SEM apagar ainda) -- mensagem que chegar
    // enquanto o leads-ia-responder ainda está rodando começa buffer próprio
    // em vez de se misturar com o que já foi capturado pra esta leva.
    await supabase.from('leads_ia_debounce').update({ em_processamento: true }).eq('telefone', phone).eq('marcador', marcador);
    const mensagemFinal = (bufferFinal.mensagens as string[]).join('\n');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${supabaseUrl}/functions/v1/leads-ia-responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({ lead_id: leadId, telefone: phone, mensagem: mensagemFinal, evolution_instance: instance }),
    });
    if (!res.ok) {
      console.error(`leads-ia-responder respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    // Só apaga o buffer se ninguém mexeu nele nesse meio-tempo (marcador ainda
    // é o mesmo) -- se uma mensagem nova chegou durante o processamento, ela
    // já virou um buffer próprio (marcador novo) e não pode ser apagada aqui.
    await supabase.from('leads_ia_debounce').delete().eq('telefone', phone).eq('marcador', marcador);
  })();

  try { EdgeRuntime.waitUntil(task); } catch { await task; }
}

// ── Captura de resolução humana → sugestão de conhecimento ─────────────────
// Quando o SDR de IA não sabe responder algo (leads_ia_conversas em
// aguardando_humano/duvida_sem_resposta) e um humano manda uma mensagem MANUAL
// (fromMe=true) pro mesmo telefone, guarda a pergunta + a resposta do humano
// como sugestão pendente de aprovação (painel na Equipe Despertamente, ficha
// do SDR). sugestao_capturada evita duplicar se o humano mandar várias
// mensagens seguidas resolvendo a mesma dúvida.
async function capturarSugestaoConhecimento(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  respostaHumano: string,
): Promise<void> {
  try {
    const s8 = phone.slice(-8);
    const { data: conversa } = await supabase
      .from('leads_ia_conversas')
      .select('id, lead_id, duvida_nao_respondida')
      .eq('status', 'aguardando_humano')
      .eq('motivo_handoff', 'duvida_sem_resposta')
      .eq('sugestao_capturada', false)
      .filter('telefone', 'ilike', `%${s8}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversa?.duvida_nao_respondida) return;

    await supabase.from('leads_ia_conhecimento_sugestoes').insert({
      conversa_id: conversa.id,
      lead_id: conversa.lead_id,
      pergunta: conversa.duvida_nao_respondida,
      resposta_humano: respostaHumano,
    });
    await supabase.from('leads_ia_conversas').update({ sugestao_capturada: true }).eq('id', conversa.id);
  } catch (e: unknown) {
    console.error('capturarSugestaoConhecimento: falha:', (e as Error).message);
  }
}

// Marca que um humano já assumiu o handoff (qualquer motivo, não só dúvida) --
// cancela o lembrete de "handoff parado" do leads-ia-followup. Só marca a
// primeira resposta manual depois do handoff, não sobrescreve em respostas seguintes.
async function marcarHumanoAssumiuConversa(
  supabase: ReturnType<typeof createClient>,
  phone: string,
): Promise<void> {
  try {
    const s8 = phone.slice(-8);
    const { data: conversa } = await supabase
      .from('leads_ia_conversas')
      .select('id')
      .eq('status', 'aguardando_humano')
      .is('humano_assumiu_em', null)
      .filter('telefone', 'ilike', `%${s8}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversa) return;
    await supabase.from('leads_ia_conversas').update({ humano_assumiu_em: new Date().toISOString() }).eq('id', conversa.id);
  } catch (e: unknown) {
    console.error('marcarHumanoAssumiuConversa: falha:', (e as Error).message);
  }
}

// ── Aquecimento de leads: engajamento numa das 4 fases ────────────────────
// Sinal mais específico que o matching genérico abaixo: se o telefone que
// respondeu bate com um lead 'aguardando_engajamento' NA MESMA instância que
// mandou a fase (evolution_config_id_envio), marca respondeu_fase_em e
// avança fase (ou entra em aguardando_isca com delay, se já era a fase 4).
// Precisa ser a mesma instância -- é o único jeito de saber que essa resposta
// é sobre a fase que a gente mandou, não uma resposta solta em outro número.
async function tentarMatchAquecimentoLead(
  supabase: ReturnType<typeof createClient>,
  phone: string,
  mensagemTipo: string,
  instance: string,
): Promise<boolean> {
  if (!instance) return false;
  const s8 = phone.slice(-8);

  try {
    const { data: evo } = await supabase
      .from('evolution_config')
      .select('id')
      .eq('instance_name', instance)
      .maybeSingle();
    if (!evo) return false;

    const { data: lead } = await supabase
      .from('lead_aquecimento_leads')
      .select('id, fase_atual')
      .eq('status', 'aguardando_engajamento')
      .eq('evolution_config_id_envio', evo.id)
      .filter('phone', 'ilike', `%${s8}`)
      .order('fase_enviada_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lead) return false;

    const now = new Date().toISOString();

    if (lead.fase_atual >= 4) {
      const { data: cfg } = await supabase
        .from('lead_aquecimento_config')
        .select('isca_delay_min_min, isca_delay_max_min')
        .eq('id', 'default')
        .maybeSingle();
      const min = cfg?.isca_delay_min_min ?? 5;
      const max = cfg?.isca_delay_max_min ?? 30;
      const delayMin = min + Math.random() * Math.max(0, max - min);
      const isca_agendada_para = new Date(Date.now() + delayMin * 60_000).toISOString();

      await supabase.from('lead_aquecimento_leads').update({
        respondeu_fase_em: now,
        status: 'aguardando_isca',
        isca_agendada_para,
      }).eq('id', lead.id);
    } else {
      await supabase.from('lead_aquecimento_leads').update({
        respondeu_fase_em: now,
        fase_atual: lead.fase_atual + 1,
        status: 'aguardando_envio_fase',
      }).eq('id', lead.id);
    }

    return true;
  } catch (e: unknown) {
    console.error('tentarMatchAquecimentoLead falhou:', (e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validação de secret opcional
    const webhookSecret = Deno.env.get('EVO_RESPOSTA_SECRET');
    if (webhookSecret) {
      const incoming = req.headers.get('x-webhook-secret') ?? new URL(req.url).searchParams.get('secret');
      if (incoming !== webhookSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return ok({ ok: true, skipped: true, reason: 'invalid JSON' });
    }

    const event    = String(body.event ?? body.type ?? '').toLowerCase();
    const instance = String(body.instance ?? body.instanceName ?? '');

    console.log(JSON.stringify({ event, instance, ts: new Date().toISOString() }));

    // ── Aquecimento de chips: ACK de entrega/leitura ──────────────────────────
    // Shape não documentado pela Evolution neste repo (greenfield) -- best
    // effort com múltiplos fallbacks, validar contra o payload real de teste.
    if (event === 'messages.update' || event === 'message.update') {
      console.log('RAW messages.update:', JSON.stringify(body).slice(0, 2000));
      return await handleMessagesUpdate(supabase, instance, body);
    }

    // ── Aquecimento de chips: estabilidade de conexão ─────────────────────────
    if (event === 'connection.update') {
      return await handleConnectionUpdate(supabase, instance, body);
    }

    // Só processa mensagens recebidas (upsert)
    if (!event.includes('message')) {
      return ok({ ok: true, skipped: true, reason: `event="${event}" ignored` });
    }

    const data = (body.data ?? {}) as Record<string, unknown>;
    const key  = (data.key ?? {}) as Record<string, unknown>;

    const remoteJid = String(key.remoteJid ?? '');
    const fromMe    = Boolean(key.fromMe);
    const message   = (data.message ?? {}) as Record<string, unknown>;
    // Nome de exibição do WhatsApp de quem mandou a mensagem -- campo padrão
    // do webhook Baileys/Evolution, ainda não validado contra payload real
    // neste arquivo (mesmo cuidado dos outros "shape não documentado" acima).
    // Usado só como fallback pro nome do lead direto do anúncio IDM.
    const pushName  = String(data.pushName ?? '').trim();

    // Voto de enquete: chega como message.upsert de grupo com pollUpdateMessage.
    // Precisa ser tratado ANTES do skip de "mensagem de grupo" abaixo, senão
    // é descartado silenciosamente -- todas as enquetes do funil vão pra grupo.
    if (message.pollUpdateMessage && remoteJid.includes('@g.us')) {
      return await handlePollVote(supabase, instance, remoteJid, key, message.pollUpdateMessage as Record<string, unknown>, body);
    }

    // Ignora mensagens de grupo
    if (remoteJid.includes('@g.us'))  return ok({ ok: true, skipped: true, reason: 'group message' });
    if (!remoteJid)                   return ok({ ok: true, skipped: true, reason: 'no remoteJid' });

    const rawPhone = remoteJid.split('@')[0];
    const phone    = normalizePhone(rawPhone);
    const s8       = phone.slice(-8);

    const { text: mensagem, tipo: mensagemTipo } = extractText(message);

    // Mensagem que SAIU do numero conectado: pode ser o echo de um envio que
    // uma das 4 funcoes de envio ja gravou (dedupe por evolution_message_id
    // dentro de registrarMensagemManualSeNova), ou pode ter sido mandada na
    // mao pelo WhatsApp Web/app -- essa nunca passa por nenhuma funcao nossa,
    // e sem isso aqui nunca aparecia no Chat. O resto do processamento abaixo
    // (opt-out, matching por tabela, IA de cobranca, notificacao) e' so pra
    // resposta de verdade, nao se aplica a mensagem que a gente mandou.
    if (fromMe) {
      const messageId = String(key.id ?? '') || null;
      await registrarMensagemManualSeNova(supabase, phone, mensagem, mensagemTipo, instance, messageId);
      // Se um humano respondeu manualmente uma dúvida que o SDR de IA não
      // sabia responder, captura como sugestão de conhecimento pendente.
      if (mensagemTipo === 'text') {
        await capturarSugestaoConhecimento(supabase, phone, mensagem);
        await marcarHumanoAssumiuConversa(supabase, phone);
      }
      return ok({ ok: true, skipped: true, reason: 'fromMe=true: gravado se manual, resto do processamento pulado' });
    }

    // Historico de conversa (aba Chat) -- gravado ANTES de qualquer match por
    // tabela, e independente de casar com alguma. Um numero desconhecido hoje
    // pode virar lead/aluno amanha, e ai a conversa ja esta completa.
    await registrarMensagemRecebida(supabase, phone, mensagem, mensagemTipo, instance);

    if (mensagemTipo === 'text' && detectarOptOut(mensagem)) {
      await registrarOptOut(supabase, phone, mensagem);
    }

    // NPA order bump: lead está esperando nome+whatsapp do convidado (2º
    // ingresso) -- sinal mais específico que o matching genérico abaixo, encerra
    // aqui se casar (já manda a confirmação/pedido de reenvio pro comprador).
    const convidadoCapturado = await tentarCapturarDadosConvidado(supabase, phone, s8, mensagem, mensagemTipo, instance);
    if (convidadoCapturado) {
      return ok({ ok: true, convidadoCapturado: true });
    }

    // Aquecimento de leads: resposta a uma das 4 fases -- sinal mais
    // específico que o matching genérico, encerra aqui se casar.
    const aquecimentoCasou = await tentarMatchAquecimentoLead(supabase, phone, mensagemTipo, instance);
    if (aquecimentoCasou) {
      return ok({ ok: true, aquecimentoLead: true });
    }

    // Lead novo do anúncio IDM: sinal mais específico que o matching por
    // tabela abaixo -- se casar, a IA de leads assume e a function encerra
    // aqui (ela já cuida de notificar no handoff, sem cair no
    // notificar_admins('lead_respondeu') genérico do fim do arquivo).
    const leadDireto = await tentarCriarLeadDireto(supabase, phone, mensagem, mensagemTipo, instance, pushName);
    if (leadDireto) {
      return ok({ ok: true, leadDireto: true, lead_id: leadDireto.lead_id });
    }

    const now = new Date().toISOString();

    // Busca leads na planilha pelo sufixo do telefone. Nao retorna cedo se nao
    // achar nada aqui -- um lead que so existe em disparo_leads (CSV, turma,
    // grupo de WPP) nunca teria linha em lancamento_leads, e antes isso fazia
    // a funcao inteira parar antes mesmo de checar disparo_leads.
    const { data: leads, error: leadsErr } = await supabase
      .from('lancamento_leads')
      .select('id, lancamento_id, whatsapp, nome')
      .filter('whatsapp', 'ilike', `%${s8}`);

    if (leadsErr) {
      console.error('leads query error:', leadsErr.message);
      return ok({ ok: false, error: leadsErr.message });
    }

    const saved: string[] = [];

    for (const lead of leads ?? []) {
      // Salva histórico
      const { error: insertErr } = await supabase.from('lead_respostas').insert({
        lead_id:            lead.id,
        lancamento_id:      lead.lancamento_id,
        phone,
        mensagem,
        mensagem_tipo:      mensagemTipo,
        evolution_instance: instance,
        recebido_em:        now,
      });

      if (insertErr) {
        console.error(`insert resposta lead=${lead.id}:`, insertErr.message);
        continue;
      }

      // Atualiza última resposta no lead
      await supabase.from('lancamento_leads').update({
        ultima_resposta_at: now,
        ultima_resposta:    mensagem.slice(0, 500),
      }).eq('id', lead.id);

      console.log(`resposta salva lead=${lead.id} nome="${lead.nome}" phone=${phone}`);
      saved.push(lead.id);
    }

    // Marca como quente e grava a resposta em disparo_leads para qualquer
    // campanha que tenha esse telefone (mesmo sufixo dos ultimos 8 digitos).
    // Alimenta a tela de Campanhas de Disparo -- "respondeu_em"/"ultima_resposta"
    // e' o que faz a coluna de resposta aparecer la, independente do lead
    // tambem existir em lancamento_leads ou nao.
    const { data: disparoLeads } = await supabase
      .from('disparo_leads')
      .select('id, phone, temperatura')
      .filter('phone', 'ilike', `%${s8}`);

    if (disparoLeads?.length) {
      const ids = disparoLeads.map((l: { id: string }) => l.id);
      await supabase
        .from('disparo_leads')
        .update({ temperatura: 'quente', respondeu_em: now, ultima_resposta: mensagem.slice(0, 500) })
        .in('id', ids);
      console.log(`resposta gravada em ${ids.length} disparo_leads para phone suffix=${s8}`);
    }

    // Mesma lógica pros logs de boas-vindas (Semana do Despertar + IDM Pelo
    // Brasil, ambos gravam em boas_vindas_logs) -- alimenta a coluna de
    // resposta na tela de Boas-vindas, independente do funil de origem.
    const { data: bvLogs } = await supabase
      .from('boas_vindas_logs')
      .select('id, whatsapp, nome, email, funnel_name, respondeu_em, wpp_status')
      .filter('whatsapp', 'ilike', `%${s8}`);

    if (bvLogs?.length) {
      const ids = bvLogs.map((l: { id: string }) => l.id);
      await supabase
        .from('boas_vindas_logs')
        .update({ respondeu_em: now, ultima_resposta: mensagem.slice(0, 500) })
        .in('id', ids);
      console.log(`resposta gravada em ${ids.length} boas_vindas_logs para phone suffix=${s8}`);

      // Primeira resposta a um boas-vindas de áudio da Semana do Despertar
      // (funil não-NPA) -- dispara o follow-up com link do grupo + 3 aulas.
      const primeirasRespostasAudio = (bvLogs as {
        id: string; whatsapp: string | null; nome: string | null; email: string | null;
        funnel_name: string; respondeu_em: string | null; wpp_status: string;
      }[]).filter(l => !l.respondeu_em && l.wpp_status === 'sent' && !/^NPA\b/i.test(l.funnel_name));

      for (const log of primeirasRespostasAudio) {
        await dispararFollowUpAudio(supabase, log, phone);
      }
    }

    // Mesma lógica pros logs de cobrança -- alimenta a coluna de resposta na tela de
    // Cobrança, pra saber quem respondeu (negociando, confirmando pagamento, etc) sem
    // precisar abrir o WhatsApp real pra cada aluno.
    const { data: cobrancaLogs } = await supabase
      .from('cobranca_logs')
      .select('id, telefone, aluno_id, aluno_nome, pagamento_id, created_at')
      .filter('telefone', 'ilike', `%${s8}`);

    if (cobrancaLogs?.length) {
      const ids = cobrancaLogs.map((l: { id: string }) => l.id);
      await supabase
        .from('cobranca_logs')
        .update({ respondeu_em: now, ultima_resposta: mensagem.slice(0, 500) })
        .in('id', ids);
      console.log(`resposta gravada em ${ids.length} cobranca_logs para phone suffix=${s8}`);
    }

    // ── IA de cobrança: aluno respondeu a uma mensagem de cobrança ──────────
    // Bloco isolado -- não interage com o follow-up de áudio acima nem com o
    // resto do matching por sufixo de telefone. Só aciona pra quem já é aluno
    // cadastrado (aluno_id não-nulo em cobranca_logs, preenchido só quando a
    // mensagem original foi mandada via get_alunos_para_cobranca) -- nunca
    // pra contato desconhecido nem pra grupo (grupo já foi descartado acima).
    if (mensagemTipo === 'text' && cobrancaLogs?.length) {
      await tentarAcionarIaCobranca(supabase, cobrancaLogs as CobrancaLogComAluno[], phone, mensagem, instance);
    }

    if (!saved.length && !disparoLeads?.length && !bvLogs?.length && !cobrancaLogs?.length) {
      console.log(`phone suffix ${s8} not found in lancamento_leads, disparo_leads, boas_vindas_logs nem cobranca_logs — ignoring`);
      return ok({ ok: true, skipped: true, reason: 'phone not found' });
    }

    // Avisa os admins de qualquer resposta identificada (aluno de cobrança, lead de
    // funil ou boas-vindas) -- 1 notificação por mensagem recebida, não 1 por tabela
    // atualizada. Prioriza o nome de quem já é aluno cadastrado (cobrança), depois lead
    // de lançamento, depois boas-vindas; cai pro telefone se nada tiver nome.
    const nomeIdentificado =
      (cobrancaLogs as { aluno_nome?: string }[] | null)?.[0]?.aluno_nome
      ?? (leads ?? []).find(l => saved.includes(l.id))?.nome
      ?? (bvLogs as { nome?: string | null }[] | null)?.[0]?.nome
      ?? phone;
    await supabase.rpc('notificar_admins', {
      p_tipo: 'lead_respondeu',
      p_titulo: `${nomeIdentificado} respondeu no WhatsApp`,
      p_descricao: mensagem.slice(0, 200),
      p_link: cobrancaLogs?.length ? '/cobranca' : null,
    });

    return ok({
      ok: true,
      saved: saved.length,
      leads: saved,
      disparoLeadsAtualizados: disparoLeads?.length ?? 0,
      boasVindasLogsAtualizados: bvLogs?.length ?? 0,
      cobrancaLogsAtualizados: cobrancaLogs?.length ?? 0,
    });

  } catch (e: unknown) {
    console.error('evo-resposta fatal:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

// ── ACK (messages.update): casa com aquecimento_jobs.evolution_message_id ────
// Confirmado via captura real de payload (aquecimento_ack_debug, 2026-08-17):
// a Evolution manda `status` como STRING ("DELIVERY_ACK"), não como número
// Baileys cru -- mantém o numérico como fallback pra outras versões/eventos
// que ainda mandem 0-5.
function ackStatusFromRaw(status: unknown): 'entregue' | 'lido' | 'falhou' | null {
  if (typeof status === 'number') {
    if (status <= 0) return 'falhou';
    if (status >= 4) return 'lido';
    if (status === 3) return 'entregue';
    return null; // pendente/servidor ainda não é sinal suficiente
  }
  if (typeof status === 'string') {
    const s = status.toUpperCase();
    if (s === 'ERROR') return 'falhou';
    if (s === 'DELIVERY_ACK') return 'entregue';
    if (s === 'READ' || s === 'PLAYED') return 'lido';
    return null; // PENDING/SERVER_ACK ainda não é sinal suficiente
  }
  return null;
}

async function handleMessagesUpdate(
  supabase: ReturnType<typeof createClient>,
  instance: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const data = body.data ?? {};
  const updates = Array.isArray(data) ? data : [data];
  let atualizados = 0;

  for (const upd of updates as Record<string, unknown>[]) {
    const key = (upd.key ?? {}) as Record<string, unknown>;
    const messageId = String(key.id ?? upd.keyId ?? upd.id ?? '');

    // Captura heurística: há relatos de que o voto de enquete só dispara
    // messages.update (não messages.upsert) em algumas versões da Evolution
    // API, sem forma documentada do payload. Guarda bruto pra inspecionar
    // depois, sem tentar decodificar um formato que ainda não confirmamos.
    const groupJidUpd = String(key.remoteJid ?? '');
    if (groupJidUpd.includes('@g.us') && JSON.stringify(upd).toLowerCase().includes('poll')) {
      const voterJidUpd = String(key.participant ?? '');
      await supabase.from('funnel_poll_respostas').insert({
        group_jid: groupJidUpd,
        voter_jid: voterJidUpd || null,
        voter_phone: voterJidUpd ? normalizePhone(voterJidUpd.split('@')[0]) : null,
        evolution_instance: instance,
        event_type: 'messages.update:heuristic',
        raw_payload: upd,
      }).then(({ error }) => { if (error) console.error('poll heuristic insert error:', error.message); });
    }

    if (!messageId) continue;

    const statusRaw = (upd.update as Record<string, unknown>)?.status ?? upd.status;
    const ackStatus = ackStatusFromRaw(statusRaw);
    if (!ackStatus) continue;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { ack_status: ackStatus };
    if (ackStatus === 'entregue') patch.entregue_em = now;
    if (ackStatus === 'lido') patch.lido_em = now;

    const { data: updated } = await supabase
      .from('aquecimento_jobs')
      .update(patch)
      .eq('evolution_message_id', messageId)
      .select('id');

    if (updated?.length) atualizados += updated.length;

    // "falhou" confirmado pelo WhatsApp (não só HTTP 200 da Evolution): tenta
    // reenviar automaticamente 1 vez -- volta pra pendente pro disparo-runner
    // pegar no próximo ciclo. Só 1 vez por lead (reenviado_apos_falha) pra não
    // ficar em loop se o número for mesmo inalcançável.
    if (ackStatus === 'falhou') {
      const { data: leadsFalhos } = await supabase
        .from('disparo_leads')
        .select('id, reenviado_apos_falha')
        .eq('evolution_message_id', messageId);

      for (const lead of (leadsFalhos ?? []) as { id: string; reenviado_apos_falha: boolean }[]) {
        if (!lead.reenviado_apos_falha) {
          await supabase.from('disparo_leads').update({
            status: 'pendente', sent_at: null, error_msg: null,
            instance_id: null, evolution_message_id: null, ack_status: null,
            reenviado_apos_falha: true,
          }).eq('id', lead.id);
        } else {
          await supabase.from('disparo_leads').update(patch).eq('id', lead.id);
        }
        atualizados++;
      }
    } else {
      const { data: updatedDisparo } = await supabase
        .from('disparo_leads')
        .update(patch)
        .eq('evolution_message_id', messageId)
        .select('id');

      if (updatedDisparo?.length) atualizados += updatedDisparo.length;
    }
  }

  return ok({ ok: true, tipo: 'messages.update', atualizados });
}

// ── Voto de enquete (pollUpdateMessage): captura bruta ──────────────────────
// O voto chega criptografado (selectedOptions são hashes SHA-256 da opção,
// e o payload em si vem cifrado com uma chave derivada da mensagem original
// da enquete) -- a Evolution API tem bug documentado nisso
// (github.com/EvolutionAPI/evolution-api/issues/1644). Por ora guardamos o
// payload bruto + quem/quando/qual funil, o suficiente pra saber quem
// engajou com a enquete. Decodificar a opção escolhida fica pra uma fase
// seguinte, depois de inspecionar um payload real em produção.
async function handlePollVote(
  supabase: ReturnType<typeof createClient>,
  instance: string,
  groupJid: string,
  key: Record<string, unknown>,
  pollUpdate: Record<string, unknown>,
  rawBody: Record<string, unknown>,
): Promise<Response> {
  const voterJid   = String(key.participant ?? key.remoteJid ?? '');
  const voterPhone = voterJid ? normalizePhone(voterJid.split('@')[0]) : null;

  const pollCreationKey       = (pollUpdate.pollCreationMessageKey ?? {}) as Record<string, unknown>;
  const pollCreationMessageId = String(pollCreationKey.id ?? '') || null;

  const { data: funnelCfg } = await supabase
    .from('funnel_configs')
    .select('funnel_name')
    .or(`grupo_1_id.eq.${groupJid},grupo_2_id.eq.${groupJid}`)
    .maybeSingle();

  let funnelMessageId: string | null = null;
  let pollName: string | null = null;

  if (funnelCfg?.funnel_name) {
    const { data: pollMsg } = await supabase
      .from('funnel_messages')
      .select('id, poll_name')
      .eq('funnel_name', funnelCfg.funnel_name)
      .eq('message_type', 'poll')
      .eq('status', 'sent')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    funnelMessageId = pollMsg?.id ?? null;
    pollName        = pollMsg?.poll_name ?? null;
  }

  const { error: insertErr } = await supabase.from('funnel_poll_respostas').insert({
    funnel_message_id:        funnelMessageId,
    funnel_name:               funnelCfg?.funnel_name ?? null,
    group_jid:                 groupJid,
    poll_creation_message_id:  pollCreationMessageId,
    poll_name:                 pollName,
    voter_jid:                 voterJid || null,
    voter_phone:                voterPhone,
    evolution_instance:        instance,
    event_type:                'messages.upsert:pollUpdateMessage',
    raw_payload:                rawBody,
  });

  if (insertErr) console.error('handlePollVote insert error:', insertErr.message);

  return ok({
    ok: true,
    tipo: 'poll_vote',
    funnel: funnelCfg?.funnel_name ?? null,
    voterPhone,
    saved: !insertErr,
  });
}

// ── Conexão (connection.update): histórico de estabilidade por instância ────
async function handleConnectionUpdate(
  supabase: ReturnType<typeof createClient>,
  instance: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!instance) return ok({ ok: true, skipped: true, reason: 'connection.update sem instance' });

  const data = (body.data ?? {}) as Record<string, unknown>;
  const state = String(
    data.state ?? (data.instance as Record<string, unknown>)?.state ?? data.connection ?? '',
  ).toLowerCase();
  if (!state) return ok({ ok: true, skipped: true, reason: 'connection.update sem state' });

  const { data: evoConfig } = await supabase
    .from('evolution_config')
    .select('id')
    .eq('instance_name', instance)
    .maybeSingle();

  await supabase.from('evolution_conexao_eventos').insert({
    evolution_config_id: evoConfig?.id ?? null,
    instance_name: instance,
    state,
  });

  return ok({ ok: true, tipo: 'connection.update', instance, state });
}
