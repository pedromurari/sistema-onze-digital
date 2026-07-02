import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
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
      .select('id, nome, email, whatsapp, turma, npa_evento_id, bv_enviado, ingresso_pago')
      .eq('id', lead_id)
      .single();

    if (!lead?.ingresso_pago || lead.bv_enviado || !lead.whatsapp) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // ── Busca o evento ─────────────────────────────────────────────────────
    const { data: evento } = await supabase
      .from('npa_eventos')
      .select('nome, data_evento')
      .eq('id', lead.npa_evento_id)
      .single();

    if (!evento) return new Response(JSON.stringify({ error: 'evento not found' }), { status: 200 });

    // ── Busca funnel_configs ───────────────────────────────────────────────
    const { data: fConfig } = await supabase
      .from('funnel_configs')
      .select('variaveis')
      .eq('funnel_name', evento.nome)
      .maybeSingle();

    const vars: Record<string, string> = (fConfig as any)?.variaveis ?? {};

    const tpl = lead.turma === 'tarde'
      ? (vars['bv_wpp_tarde'] || vars['bv_wpp_manha'])
      : vars['bv_wpp_manha'];

    const fallback = `🌟 Bem-vindo(a) ao ${evento.nome}!\nSua inscrição está confirmada! 🙌\n\nAguarde as próximas mensagens com todas as informações do evento.\n\nQualquer dúvida, estamos por aqui!`;

    const linkGrupo = lead.turma === 'tarde'
      ? (vars['link_grupo_tarde'] || vars['link_grupo_2'] || vars['link_grupo_manha'] || '')
      : (vars['link_grupo_manha'] || vars['link_grupo_1'] || '');

    const dataEvento = evento.data_evento
      ? new Date(evento.data_evento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      : '';

    const templateVars: Record<string, string> = {
      nome: lead.nome || 'você',
      evento_nome: evento.nome,
      turma: lead.turma === 'manha' ? 'Manhã' : 'Tarde',
      link_grupo: linkGrupo,
      link_grupo_manha: vars['link_grupo_manha'] || vars['link_grupo_1'] || '',
      link_grupo_tarde: vars['link_grupo_tarde'] || vars['link_grupo_2'] || '',
      data_evento: dataEvento,
    };

    const mensagem = applyVars(tpl || fallback, templateVars);

    // ── Busca Evolution API ────────────────────────────────────────────────
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .limit(1);

    if (!evoRows?.length) {
      console.warn('npa-bv-trigger: nenhuma instância Evolution ativa');
      return new Response(JSON.stringify({ error: 'no evolution config' }), { status: 200 });
    }

    const evo = evoRows[0];
    const rawBase = (evo.api_url as string).replace(/\/$/, '');
    const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const phone = lead.whatsapp.replace(/\D/g, '');
    const number = `${phone}@whatsapp.net`;

    // ── Envia WPP ─────────────────────────────────────────────────────────
    const sendMsg = async (text: string) => {
      const r = await fetch(`${evoBase}/message/sendText/${evo.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
        body: JSON.stringify({ number, text, delay: 1200 }),
      });
      if (!r.ok) console.warn(`npa-bv-trigger sendMsg ${r.status}`);
      return r.ok;
    };

    const sent = await sendMsg(mensagem);
    console.log(`npa-bv-trigger: lead=${lead_id} evento="${evento.nome}" sent=${sent}`);

    // Envia link do grupo separado se o template não incluiu o link
    if (sent && linkGrupo && !mensagem.includes(linkGrupo)) {
      await new Promise(r => setTimeout(r, 2000));
      await sendMsg(
        `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento serão enviadas pelo grupo dos alunos.\n\n👉 Entre agora:\n${linkGrupo}`,
      );
    }

    // ── Envia Email (se configurado em boas_vindas_config) ────────────────
    let emailStatus = 'skipped';
    if (lead.email) {
      const { data: bvCfg } = await supabase
        .from('boas_vindas_config')
        .select('email_ativo, email_assunto, email_corpo')
        .eq('funnel_name', evento.nome)
        .maybeSingle();

      if (bvCfg?.email_ativo && bvCfg.email_assunto && bvCfg.email_corpo) {
        try {
          const assunto = applyVars(bvCfg.email_assunto, templateVars);
          const corpo   = applyVars(bvCfg.email_corpo,   templateVars);

          const { data: emailRes } = await supabase.functions.invoke('email-enviar', {
            body: {
              to:      lead.email,
              to_name: lead.nome || undefined,
              subject: assunto,
              html:    corpo,
            },
          });

          if ((emailRes as any)?.error) throw new Error((emailRes as any).error);
          emailStatus = 'sent';
          console.log(`npa-bv-trigger: email sent to ${lead.email}`);
        } catch (e: unknown) {
          emailStatus = 'error';
          console.error(`npa-bv-trigger email error: ${(e as Error).message}`);
        }
      }
    }

    if (sent) {
      await supabase
        .from('npa_evento_leads')
        .update({ bv_enviado: true, bv_enviado_em: new Date().toISOString() })
        .eq('id', lead_id);
    }

    return new Response(JSON.stringify({ ok: sent, email_status: emailStatus }), { status: 200 });

  } catch (e: unknown) {
    console.error('npa-bv-trigger error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }
});
