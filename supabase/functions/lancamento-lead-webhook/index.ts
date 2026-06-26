import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      .from('lancamento_leads')
      .select('id, nome, email, whatsapp, lancamento_id, created_at')
      .eq('id', lead_id)
      .single();

    if (!lead?.lancamento_id) {
      return new Response(JSON.stringify({ skipped: 'lead not found' }), { status: 200 });
    }

    // ── Busca nome do lançamento ───────────────────────────────────────────
    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('nome')
      .eq('id', lead.lancamento_id)
      .single();

    if (!lanc) return new Response(JSON.stringify({ skipped: 'lancamento not found' }), { status: 200 });

    // ── Busca funnel_configs (n8n webhook + link_grupo) ────────────────────
    const { data: fc } = await supabase
      .from('funnel_configs')
      .select('variaveis')
      .eq('funnel_name', lanc.nome)
      .maybeSingle();

    const vars: Record<string, string> = (fc as any)?.variaveis ?? {};
    const n8nWebhook = vars['n8n_bv_webhook'] ?? '';

    if (!n8nWebhook) {
      console.log(`lancamento-lead-webhook: sem n8n_bv_webhook para "${lanc.nome}" — pulando`);
      return new Response(JSON.stringify({ skipped: 'n8n_bv_webhook not configured' }), { status: 200 });
    }

    // ── Monta payload para o n8n ───────────────────────────────────────────
    const linkGrupo = vars['link_grupo_1'] || vars['link_grupo'] || '';

    const payload = {
      lead_id:     lead.id,
      nome:        lead.nome ?? '',
      email:       lead.email ?? '',
      whatsapp:    lead.whatsapp ?? '',
      lancamento:  lanc.nome,
      link_grupo:  linkGrupo,
      data_aula_1: vars['data_aula_1'] ?? '',
      hora_aula_1: vars['hora_aula_1'] ?? '',
      data_aula_2: vars['data_aula_2'] ?? '',
      hora_aula_2: vars['hora_aula_2'] ?? '',
      data_aula_3: vars['data_aula_3'] ?? '',
      hora_aula_3: vars['hora_aula_3'] ?? '',
      created_at:  lead.created_at,
    };

    // ── Chama o n8n ───────────────────────────────────────────────────────
    const n8nRes = await fetch(n8nWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const ok = n8nRes.ok;
    console.log(`lancamento-lead-webhook: lead=${lead_id} lancamento="${lanc.nome}" n8n=${n8nRes.status} ok=${ok}`);

    return new Response(JSON.stringify({ ok, n8n_status: n8nRes.status }), { status: 200 });

  } catch (e: unknown) {
    console.error('lancamento-lead-webhook error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }
});
