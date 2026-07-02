import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase edge runtime exposes EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature, event',
};

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendWpp(base: string, instance: string, apikey: string, number: string, text: string) {
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ number, text, delay: 1200 }),
  });
  if (!res.ok) console.warn(`sendWpp ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    // Append T12:00:00 to avoid UTC midnight shifting to previous day in America/Sao_Paulo
    const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
    return d.toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

// ── Seu Numerólogo handler ────────────────────────────────────────────────────

async function processNumerologa(opts: {
  supabase: ReturnType<typeof createClient>;
  eventType: string;
  phone: string;
  nome: string;
  email: string | null;
  pixCode: string;
}) {
  const { supabase, eventType, phone, nome, email, pixCode } = opts;

  // Config (mensagens)
  const { data: cfgRows } = await supabase
    .from('seu_numerologo_config')
    .select('mensagem_pix_template, mensagem_compra_template')
    .limit(1);
  const cfg = cfgRows?.[0] ?? null;

  // Evolution API
  const { data: evoRows } = await supabase
    .from('evolution_config')
    .select('api_url, api_key, instance_name')
    .eq('ativo', true)
    .order('prioridade', { ascending: true })
    .limit(1);

  if (!evoRows?.length) { console.warn('vega-webhook/numerologo: Evolution API não configurada'); return; }

  const evo     = evoRows[0];
  const rawBase = evo.api_url.replace(/\/$/, '');
  const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  const number  = `${phone}@whatsapp.net`;
  const nomeVar = nome || 'você';

  // Lead existente
  const { data: leadRows } = await supabase
    .from('seu_numerologo_leads')
    .select('id, status, comprou_at, pago_at')
    .or(`whatsapp.eq.${phone},whatsapp.eq.+${phone}`)
    .limit(1);
  const lead = leadRows?.[0] ?? null;

  if (eventType === 'sale_wait_payment') {
    if (!pixCode) { console.warn('vega-webhook/numerologo: pix_code ausente'); return; }

    const pixTpl = cfg?.mensagem_pix_template ||
      `Olá, {{nome}}! 👋\n\nSeu PIX para o *Mapa Numerológico Pitagórico* foi gerado com sucesso.\n\n✅ Pagamento 100% seguro\n✅ Acesso liberado automaticamente após confirmação\n\nAguardando confirmação para liberar o seu mapa. ✨`;

    await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
      pixTpl.replace('{{nome}}', nomeVar));
    await sleep(2000);
    await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
      'Segue abaixo o PIX copia e cola — é só copiar o código e colar no seu banco para confirmar o pagamento:');
    await sleep(2000);
    await sendWpp(evoBase, evo.instance_name, evo.api_key, number, pixCode);

    if (lead) {
      await supabase.from('seu_numerologo_leads')
        .update({ status: 'checkout', comprou_at: new Date().toISOString(), ...(email ? { email } : {}) })
        .eq('id', lead.id);
    } else {
      await supabase.from('seu_numerologo_leads').insert({
        nome: nomeVar, whatsapp: phone, email: email ?? null,
        produto: 'Mapa Numerológico Pitagórico Aplicado - SN',
        status: 'checkout', comprou_at: new Date().toISOString(),
      });
    }
    return;
  }

  if (eventType === 'sale_paid') {
    const compraTpl = cfg?.mensagem_compra_template ||
      `🎉 Pagamento confirmado, {{nome}}!\n\nSeu *Mapa Numerológico Pitagórico* está sendo preparado com carinho.\n\nEm breve você receberá o seu mapa aqui mesmo. Fique de olho nas próximas mensagens! ✨`;

    await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
      compraTpl.replace('{{nome}}', nomeVar));

    if (lead) {
      await supabase.from('seu_numerologo_leads')
        .update({ status: 'pago', pago_at: new Date().toISOString(), ...(email ? { email } : {}) })
        .eq('id', lead.id);
    } else {
      await supabase.from('seu_numerologo_leads').insert({
        nome: nomeVar, whatsapp: phone, email: email ?? null,
        produto: 'Mapa Numerológico Pitagórico Aplicado - SN',
        status: 'pago', pago_at: new Date().toISOString(),
      });
    }
    return;
  }
}

// ── background processing ─────────────────────────────────────────────────────

async function processVegaWebhook(
  body: Record<string, unknown>,
  eventType: string,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase   = createClient(supabaseUrl, supabaseKey);

  const phoneRaw     = String(body?.customer?.phone ?? body?.phone ?? '');
  const nome         = String(body?.customer?.name  ?? body?.name  ?? '');
  const email        = String(body?.customer?.email ?? body?.email ?? '') || null;
  const produtoTitle = String((body?.plans as any)?.[0]?.products?.[0]?.title ?? body?.produto ?? '');
  const pixCode      = String(body?.pix_code ?? '');

  if (!produtoTitle) { console.warn('vega-webhook: produto não identificado'); return; }

  const phone = normalizePhone(phoneRaw);
  console.log(`vega-webhook: event=${eventType} produto="${produtoTitle}" phone=${phone}`);

  // ── Branch: Seu Numerólogo ────────────────────────────────────────────────
  const NUMEROLOGO_PRODUTO = 'Mapa Numerológico Pitagórico Aplicado - SN';
  if (produtoTitle === NUMEROLOGO_PRODUTO) {
    await processNumerologa({ supabase, eventType, phone, nome, email, pixCode });
    return;
  }

  // ── Encontra NPA ──────────────────────────────────────────────────────────
  const { data: npas } = await supabase
    .from('npa_eventos')
    .select('id, nome, data_evento, vega_produto_id, vega_produto_tarde, pix_mensagem_template')
    .or(`vega_produto_id.eq.${produtoTitle},vega_produto_tarde.eq.${produtoTitle}`);

  if (!npas?.length) {
    console.warn(`vega-webhook: NPA não encontrado para produto "${produtoTitle}"`);
    return;
  }

  const npa   = npas[0];
  const turma: 'manha' | 'tarde' = npa.vega_produto_id === produtoTitle ? 'manha' : 'tarde';

  // ── funnel_configs (link do grupo) ────────────────────────────────────────
  const { data: fConfig } = await supabase
    .from('funnel_configs')
    .select('variaveis')
    .eq('funnel_name', npa.nome)
    .maybeSingle();

  const variaveis: Record<string, string> = (fConfig as any)?.variaveis ?? {};
  const linkGrupo = turma === 'manha'
    ? (variaveis['link_grupo_manha'] || variaveis['link_grupo_1'] || '')
    : (variaveis['link_grupo_tarde'] || variaveis['link_grupo_2'] || '');

  // ── Evolution API ─────────────────────────────────────────────────────────
  const { data: evoRows } = await supabase
    .from('evolution_config')
    .select('api_url, api_key, instance_name')
    .eq('ativo', true)
    .order('prioridade', { ascending: true })
    .limit(1);

  if (!evoRows?.length) { console.warn('vega-webhook: Evolution API não configurada'); return; }

  const evo     = evoRows[0];
  const rawBase = evo.api_url.replace(/\/$/, '');
  const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  const number  = `${phone}@whatsapp.net`;

  // ── Procura lead ──────────────────────────────────────────────────────────
  const { data: leadRows } = await supabase
    .from('npa_evento_leads')
    .select('id, nome, ingresso_pago, pix_enviado')
    .eq('npa_evento_id', npa.id)
    .or(`whatsapp.eq.${phone},whatsapp.eq.+${phone},whatsapp.ilike.%${phone.slice(-9)}`)
    .limit(1);

  const lead   = leadRows?.[0] ?? null;
  const leadId = lead?.id ?? null;

  const msgVars: Record<string, string> = {
    nome:        nome || lead?.nome || 'você',
    evento_nome: npa.nome,
    data_evento: dateLabel(npa.data_evento),
    link_grupo:  linkGrupo,
    turma:       turma === 'manha' ? 'Manhã' : 'Tarde',
  };

  // ── sale_wait_payment ─────────────────────────────────────────────────────
  if (eventType === 'sale_wait_payment') {
    if (!pixCode) { console.warn('vega-webhook: pix_code ausente'); return; }

    // Deduplicação: se já enviou, ignora
    if (lead?.pix_enviado === true) {
      console.log('vega-webhook: PIX já enviado para', phone, '— ignorando duplicata');
      return;
    }

    const pixIntroTpl = npa.pix_mensagem_template ||
      `Olá! {{nome}} 👋\n\nSeu PIX para o ingresso do {{evento_nome}} foi gerado com sucesso.\n\n✔ O pagamento é 100% seguro\n✔ O ingresso é liberado automaticamente após a confirmação\n✔ Você receberá aqui mesmo o acesso ao grupo VIP\n\nCaso tenha qualquer dúvida, é só me avisar — estou acompanhando tudo.\n\nEstamos quase lá! ✨\n\nSua vaga será garantida assim que o PIX for validado.`;

    await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(pixIntroTpl, msgVars));
    await sleep(2000);
    await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
      'Segue abaixo o pix copia e cola, é só copiar o código e colocar no seu banco para confirmar o pagamento.');
    await sleep(2000);
    await sendWpp(evoBase, evo.instance_name, evo.api_key, number, pixCode);

    if (leadId) {
      await supabase
        .from('npa_evento_leads')
        .update({ pix_enviado: true, pix_codigo: pixCode, pix_enviado_em: new Date().toISOString(), ...(email ? { email } : {}) })
        .eq('id', leadId);
    }
    return;
  }

  // ── sale_paid ─────────────────────────────────────────────────────────────
  if (eventType === 'sale_paid') {
    // Deduplicação: se já está como ingresso_pago, ignora
    if (lead?.ingresso_pago === true) {
      console.log('vega-webhook: ingresso_pago já marcado para', phone, '— ignorando duplicata');
      return;
    }

    // Template por turma configurado no wizard (funnel_configs.variaveis.bv_wpp_manha / bv_wpp_tarde)
    const bemVindoTpl = turma === 'tarde'
      ? (variaveis['bv_wpp_tarde'] || variaveis['bv_wpp_manha'])
      : variaveis['bv_wpp_manha'];

    const bemVindoMsg = bemVindoTpl ||
      `🌟 Bem-vindo(a) ao {{evento_nome}}!\nSua inscrição está confirmada! 🙌\n\n📅 Data do evento: {{data_evento}} — Turma {{turma}}\n\nNas próximas mensagens você receberá:\n\n✔ Link para entrar no Grupo VIP dos alunos\n✔ Informações essenciais sobre o evento\n✔ Conteúdos bônus surpresa 🎁\n\nFique atento às mensagens para não perder nada.\nQualquer dúvida, estamos por aqui!`;

    await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(bemVindoMsg, msgVars));
    await sleep(3000);

    // Só envia mensagem separada de grupo se o template configurado não incluir o link
    if (linkGrupo && !bemVindoTpl) {
      const grupoMsg =
        `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento, avisos e bônus serão enviados exclusivamente pelo grupo dos alunos.\n\n👉 Entre agora:\n{{link_grupo}}\n\nNo grupo você vai receber:\n🔹 Avisos importantes do dia\n🔹 Materiais complementares\n🔹 Bônus surpresa que só os alunos vão ter acesso 👀\n\nEntrou? Me avise aqui para confirmar!`;
      await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(grupoMsg, msgVars));
    }

    const agora = new Date().toISOString();

    if (leadId) {
      await supabase
        .from('npa_evento_leads')
        .update({
          ingresso_pago: true,
          bv_enviado: true, bv_enviado_em: agora,
          no_grupo: false, presente_evento: false, esteve_no_evento: false,
          closer: false, follow_up_01: false, follow_up_02: false, follow_up_03: false, matriculado: false,
          ...(email ? { email } : {}),
        })
        .eq('id', leadId);
    } else if (phone) {
      await supabase.from('npa_evento_leads').insert({
        npa_evento_id: npa.id, nome: nome || 'Lead Vega',
        whatsapp: phone, email: email ?? null,
        turma, fase: 'ingresso_pago', ingresso_pago: true,
        bv_enviado: true, bv_enviado_em: agora,
      });
    }
  }
}

// ── serve ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const eventType = req.headers.get('event') ?? String(body?.event ?? '');

    // Dispara processamento em background e responde imediatamente
    // (evita que o Vega retry por timeout — o envio WPP pode levar 5-10s)
    const task = processVegaWebhook(body, eventType).catch(e =>
      console.error('vega-webhook background error:', e?.message ?? e),
    );

    try { EdgeRuntime.waitUntil(task); } catch { /* fallback: processo continua mesmo sem waitUntil */ }

    return new Response(JSON.stringify({ ok: true, received: eventType }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
