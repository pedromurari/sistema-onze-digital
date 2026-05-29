import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`sendWpp ${res.status}: ${body.slice(0, 300)}`);
  }
}

function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

// ── main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase   = createClient(supabaseUrl, supabaseKey);

    // ── Parse payload ─────────────────────────────────────────────────────────
    // Vega envia o tipo de evento no header "event"
    const eventHeader = req.headers.get('event') ?? '';
    const body = await req.json();

    const eventType   = eventHeader || (body.event as string) || '';
    const phoneRaw    = (body?.customer?.phone as string) ?? '';
    const nome        = (body?.customer?.name  as string) ?? '';
    const produtoTitle = (body?.plans?.[0]?.products?.[0]?.title as string) ?? '';
    const pixCode     = (body?.pix_code as string) ?? '';

    if (!produtoTitle) {
      return new Response(JSON.stringify({ ok: false, error: 'produto não identificado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phone = normalizePhone(phoneRaw); // ex: 5541999999999

    console.log(`vega-webhook: event=${eventType} produto="${produtoTitle}" phone=${phone}`);

    // ── Encontra NPA pelo nome do produto (manhã ou tarde) ────────────────────
    const { data: npas } = await supabase
      .from('npa_eventos')
      .select('id, nome, data_live, vega_produto_id, vega_produto_tarde, pix_mensagem_template')
      .or(`vega_produto_id.eq.${produtoTitle},vega_produto_tarde.eq.${produtoTitle}`);

    if (!npas?.length) {
      console.warn(`vega-webhook: nenhum NPA encontrado para produto "${produtoTitle}"`);
      return new Response(JSON.stringify({ ok: false, error: 'NPA não encontrado para este produto' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const npa = npas[0];
    const turma: 'manha' | 'tarde' = npa.vega_produto_id === produtoTitle ? 'manha' : 'tarde';

    // ── Pega funnel_configs para link do grupo ────────────────────────────────
    const { data: fConfig } = await supabase
      .from('funnel_configs')
      .select('variaveis')
      .eq('funnel_name', npa.nome)
      .maybeSingle();

    const variaveis: Record<string, string> = (fConfig as any)?.variaveis ?? {};
    const linkGrupo = turma === 'manha'
      ? (variaveis['link_grupo_manha'] || variaveis['link_grupo_1'] || '')
      : (variaveis['link_grupo_tarde'] || variaveis['link_grupo_2'] || '');

    // ── Pega instância Evolution ──────────────────────────────────────────────
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .limit(1);

    if (!evoRows?.length) {
      return new Response(JSON.stringify({ ok: false, error: 'Evolution API não configurada' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const evo = evoRows[0];
    const base = evo.api_url.replace(/\/$/, '');
    const evoBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    const number = `${phone}@whatsapp.net`; // formato pessoal

    // ── Procura lead no sistema ───────────────────────────────────────────────
    const { data: leadRows } = await supabase
      .from('npa_evento_leads')
      .select('id, nome, fase, turma, pix_enviado')
      .eq('npa_evento_id', npa.id)
      .or(`whatsapp.eq.${phone},whatsapp.eq.+${phone},whatsapp.ilike.%${phone.slice(-9)}`)
      .limit(1);

    const lead = leadRows?.[0] ?? null;
    const leadId = lead?.id ?? null;

    const msgVars: Record<string, string> = {
      nome:        nome || lead?.nome || 'você',
      evento_nome: npa.nome,
      data_evento: dateLabel(npa.data_live),
      link_grupo:  linkGrupo,
      turma:       turma === 'manha' ? 'Manhã' : 'Tarde',
    };

    // ── EVENTO: sale_wait_payment (PIX gerado) ────────────────────────────────
    if (eventType === 'sale_wait_payment') {
      if (!pixCode) {
        return new Response(JSON.stringify({ ok: false, error: 'pix_code ausente no payload' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mensagem 1: intro do PIX
      const pixIntroTpl = npa.pix_mensagem_template ||
        `Olá! {{nome}} 👋\n\nSeu PIX para o ingresso do {{evento_nome}} foi gerado com sucesso.\n\n✔ O pagamento é 100% seguro\n✔ O ingresso é liberado automaticamente após a confirmação\n✔ Você receberá aqui mesmo o acesso ao grupo VIP\n\nCaso tenha qualquer dúvida, é só me avisar — estou acompanhando tudo.\n\nEstamos quase lá! ✨\n\nSua vaga será garantida assim que o PIX for validado.`;

      await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(pixIntroTpl, msgVars));
      await sleep(2000);

      // Mensagem 2: aviso do código
      await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
        'Segue abaixo o pix copia e cola, é só copiar o código e colocar no seu banco para confirmar o pagamento.');
      await sleep(2000);

      // Mensagem 3: código PIX
      await sendWpp(evoBase, evo.instance_name, evo.api_key, number, pixCode);

      // Atualiza lead (se existir)
      if (leadId) {
        await supabase
          .from('npa_evento_leads')
          .update({ pix_enviado: true, pix_codigo: pixCode, pix_enviado_em: new Date().toISOString() })
          .eq('id', leadId);
      }

      return new Response(JSON.stringify({ ok: true, event: 'pix_enviado', lead_found: !!leadId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── EVENTO: sale_paid (compra aprovada) ───────────────────────────────────
    if (eventType === 'sale_paid') {
      // Mensagem 1: boas-vindas / confirmação
      const bemVindoMsg =
        `🌟 Bem-vindo(a) ao {{evento_nome}}!\nSua inscrição está confirmada! 🙌\n\n📅 Data do evento: {{data_evento}} — Turma {{turma}}\n\nNas próximas mensagens você receberá:\n\n✔ Link para entrar no Grupo VIP dos alunos\n✔ Informações essenciais sobre o evento\n✔ Conteúdos bônus surpresa 🎁\n\nFique atento às mensagens para não perder nada.\nQualquer dúvida, estamos por aqui!`;

      await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(bemVindoMsg, msgVars));
      await sleep(3000);

      // Mensagem 2: link do grupo VIP
      if (linkGrupo) {
        const grupoMsg =
          `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento, avisos e bônus serão enviados exclusivamente pelo grupo dos alunos.\n\n👉 Entre agora:\n{{link_grupo}}\n\nNo grupo você vai receber:\n🔹 Avisos importantes do dia\n🔹 Materiais complementares\n🔹 Bônus surpresa que só os alunos vão ter acesso 👀\n\nEntrou? Me avise aqui para confirmar!`;
        await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(grupoMsg, msgVars));
      }

      // Avança lead para ingresso_pago (se existir no sistema)
      if (leadId) {
        await supabase
          .from('npa_evento_leads')
          .update({
            ingresso_pago: true,
            no_grupo: false,
            presente_evento: false,
            esteve_no_evento: false,
            closer: false,
            follow_up_01: false,
            follow_up_02: false,
            follow_up_03: false,
            matriculado: false,
          })
          .eq('id', leadId);
      } else if (phone) {
        // Lead não existe no sistema → cria automaticamente
        await supabase.from('npa_evento_leads').insert({
          npa_evento_id: npa.id,
          nome:          nome || 'Lead Vega',
          whatsapp:      phone,
          turma,
          fase:          'ingresso_pago',
          ingresso_pago: true,
        });
      }

      return new Response(JSON.stringify({ ok: true, event: 'sale_paid', turma, lead_found: !!leadId }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Outros eventos (sale_refunded, etc.) — apenas log
    return new Response(JSON.stringify({ ok: true, event: eventType, skipped: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('vega-webhook error:', (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
