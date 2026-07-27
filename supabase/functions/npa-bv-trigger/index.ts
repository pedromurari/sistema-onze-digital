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

    // ── Busca funnel_configs (links de grupo) e boas_vindas_config (mensagens) ─
    const [{ data: fConfig }, { data: bvCfg }] = await Promise.all([
      supabase.from('funnel_configs').select('variaveis').eq('funnel_name', evento.nome).maybeSingle(),
      supabase.from('boas_vindas_config')
        .select('ativo, wpp_ativo, wpp_mensagem, wpp_mensagem_tarde, wpp_message_type, wpp_media_url, email_ativo, email_assunto, email_corpo')
        .eq('funnel_name', evento.nome)
        .maybeSingle(),
    ]);

    const vars: Record<string, string> = (fConfig as any)?.variaveis ?? {};

    // Sem linha em boas_vindas_config ainda: mantém comportamento antigo (manda
    // WhatsApp por padrão). Com linha, respeita o toggle wpp_ativo -- é o que
    // dá pra ligar/desligar pela tela de Boas-vindas.
    const wppEnabled = bvCfg ? bvCfg.wpp_ativo === true : true;

    const tplNovo = lead.turma === 'tarde'
      ? (bvCfg?.wpp_mensagem_tarde || bvCfg?.wpp_mensagem)
      : bvCfg?.wpp_mensagem;
    const tplLegado = lead.turma === 'tarde'
      ? (vars['bv_wpp_tarde'] || vars['bv_wpp_manha'])
      : vars['bv_wpp_manha'];
    const tpl = tplNovo || tplLegado;

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

    // ── Envia WPP (se wpp_ativo) ────────────────────────────────────────────
    let wppStatus: 'sent' | 'error' | 'skipped' = 'skipped';
    let wppError: string | null = null;
    let sent = false;

    if (wppEnabled) {
      try {
        const { data: evoRows } = await supabase
          .from('evolution_config')
          .select('api_url, api_key, instance_name')
          .eq('ativo', true)
          .order('prioridade', { ascending: true })
          .limit(1);

        if (!evoRows?.length) throw new Error('nenhuma instância Evolution ativa');

        const evo = evoRows[0];
        const rawBase = (evo.api_url as string).replace(/\/$/, '');
        const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
        const phone = lead.whatsapp.replace(/\D/g, '');
        const number = `${phone}@whatsapp.net`;

        const sendMsg = async (text: string) => {
          const r = await fetch(`${evoBase}/message/sendText/${evo.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
            body: JSON.stringify({ number, text, delay: 1200 }),
          });
          const txt = await r.text();
          if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt.slice(0, 200)}`);
        };

        const msgType = (bvCfg?.wpp_message_type as string) || 'text';
        if (msgType === 'text') {
          await sendMsg(mensagem);
        } else {
          const mediaUrl = applyVars(bvCfg?.wpp_media_url ?? '', templateVars);
          if (!mediaUrl) throw new Error('wpp_media_url não configurada para o tipo de mensagem escolhido');
          const r = await fetch(`${evoBase}/message/sendMedia/${evo.instance_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
            body: JSON.stringify({ number, mediatype: msgType, media: mediaUrl, caption: mensagem, delay: 1200 }),
          });
          const txt = await r.text();
          if (!r.ok) throw new Error(`Evolution ${r.status}: ${txt.slice(0, 200)}`);
        }
        sent = true;
        wppStatus = 'sent';
        console.log(`npa-bv-trigger: lead=${lead_id} evento="${evento.nome}" sent=true`);

        // Envia link do grupo separado se o template não incluiu o link
        if (linkGrupo && !mensagem.includes(linkGrupo)) {
          await new Promise(r => setTimeout(r, 2000));
          await sendMsg(
            `🚨 IMPORTANTE — ENTRE NO GRUPO VIP!\nTodas as orientações do evento serão enviadas pelo grupo dos alunos.\n\n👉 Entre agora:\n${linkGrupo}`,
          );
        }
      } catch (e: unknown) {
        wppStatus = 'error';
        wppError = (e as Error).message;
        console.error(`npa-bv-trigger wpp error: ${wppError}`);
      }
    }

    // ── Envia Email (se configurado em boas_vindas_config) ────────────────
    let emailStatus: 'sent' | 'error' | 'skipped' = 'skipped';
    let emailError: string | null = null;
    if (lead.email && bvCfg?.email_ativo && bvCfg.email_assunto && bvCfg.email_corpo) {
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
        emailError = (e as Error).message;
        console.error(`npa-bv-trigger email error: ${emailError}`);
      }
    }

    // ── Log unificado (mesma tabela usada pelas Turmas/Lançamentos) ────────
    await supabase.from('boas_vindas_logs').insert({
      funnel_name: evento.nome,
      nome: lead.nome || null,
      whatsapp: lead.whatsapp || null,
      email: lead.email || null,
      wpp_status: wppStatus,
      email_status: emailStatus,
      wpp_error: wppError,
      email_error: emailError,
    });

    if (sent || !wppEnabled) {
      await supabase
        .from('npa_evento_leads')
        .update({ bv_enviado: true, bv_enviado_em: new Date().toISOString() })
        .eq('id', lead_id);
    }

    return new Response(JSON.stringify({ ok: sent || !wppEnabled, wpp_status: wppStatus, email_status: emailStatus }), { status: 200 });

  } catch (e: unknown) {
    console.error('npa-bv-trigger error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200 });
  }
});
