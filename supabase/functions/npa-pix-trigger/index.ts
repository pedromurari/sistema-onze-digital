import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function sendWpp(base: string, instance: string, apikey: string, number: string, text: string) {
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({ number, text, delay: 1200 }),
  });
  if (!res.ok) console.warn(`sendWpp ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return res.ok;
}

function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: 'lead_id required' }), { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Busca o lead ───────────────────────────────────────────────────────
    const { data: lead } = await supabase
      .from('npa_evento_leads')
      .select('id, nome, whatsapp, turma, npa_evento_id, pix_enviado, pix_codigo')
      .eq('id', lead_id)
      .single();

    if (!lead?.pix_codigo || lead.pix_enviado || !lead.whatsapp) {
      console.log(`npa-pix-trigger: skipped lead=${lead_id} pix_codigo=${!!lead?.pix_codigo} pix_enviado=${lead?.pix_enviado}`);
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // ── Busca o evento ─────────────────────────────────────────────────────
    const { data: evento } = await supabase
      .from('npa_eventos')
      .select('nome, data_evento, pix_mensagem_template')
      .eq('id', lead.npa_evento_id)
      .single();

    if (!evento) return new Response(JSON.stringify({ error: 'evento not found' }), { status: 200 });

    // ── funnel_configs ─────────────────────────────────────────────────────
    const { data: fConfig } = await supabase
      .from('funnel_configs')
      .select('variaveis')
      .eq('funnel_name', evento.nome)
      .maybeSingle();

    const vars: Record<string, string> = (fConfig as any)?.variaveis ?? {};
    const linkGrupo = lead.turma === 'tarde'
      ? (vars['link_grupo_tarde'] || vars['link_grupo_2'] || vars['link_grupo_manha'] || '')
      : (vars['link_grupo_manha'] || vars['link_grupo_1'] || '');

    const msgVars: Record<string, string> = {
      nome:        lead.nome || 'você',
      evento_nome: evento.nome,
      data_evento: dateLabel(evento.data_evento),
      link_grupo:  linkGrupo,
      turma:       lead.turma === 'manha' ? 'Manhã' : 'Tarde',
    };

    // ── Evolution API ──────────────────────────────────────────────────────
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .limit(1);

    if (!evoRows?.length) {
      console.warn('npa-pix-trigger: nenhuma instância Evolution ativa');
      return new Response(JSON.stringify({ error: 'no evolution config' }), { status: 200 });
    }

    const evo     = evoRows[0];
    const rawBase = (evo.api_url as string).replace(/\/$/, '');
    const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const phone   = lead.whatsapp.replace(/\D/g, '');
    const number  = `${phone}@whatsapp.net`;

    // ── Envia PIX ─────────────────────────────────────────────────────────
    const pixIntroTpl = evento.pix_mensagem_template ||
      `Olá! {{nome}} 👋\n\nSeu PIX para o ingresso do {{evento_nome}} foi gerado com sucesso.\n\n✔ O pagamento é 100% seguro\n✔ O ingresso é liberado automaticamente após a confirmação\n✔ Você receberá aqui mesmo o acesso ao grupo VIP\n\nCaso tenha qualquer dúvida, é só me avisar — estou acompanhando tudo.\n\nEstamos quase lá! ✨\n\nSua vaga será garantida assim que o PIX for validado.`;

    await sendWpp(evoBase, evo.instance_name, evo.api_key, number, fmt(pixIntroTpl, msgVars));
    await sleep(2000);
    await sendWpp(evoBase, evo.instance_name, evo.api_key, number,
      'Segue abaixo o pix copia e cola, é só copiar o código e colocar no seu banco para confirmar o pagamento.');
    await sleep(2000);
    const sent = await sendWpp(evoBase, evo.instance_name, evo.api_key, number, lead.pix_codigo);

    console.log(`npa-pix-trigger: lead=${lead_id} evento="${evento.nome}" sent=${sent}`);

    if (sent) {
      await supabase
        .from('npa_evento_leads')
        .update({ pix_enviado: true, pix_enviado_em: new Date().toISOString() })
        .eq('id', lead_id);
    }

    return new Response(JSON.stringify({ ok: sent }), { status: 200 });

  } catch (e: unknown) {
    console.error('npa-pix-trigger error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }
});
