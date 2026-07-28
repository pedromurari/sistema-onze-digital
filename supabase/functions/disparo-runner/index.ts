import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    const allInstances = await getAllInstances(supabase);

    if (!allInstances?.length) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_instances' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // A Evolution API pode aceitar a chamada REST (HTTP 200/201) mesmo com a
    // sessao do WhatsApp fechada, e so falhar silenciosamente na entrega --
    // ja vimos isso marcar lead como "enviado" sem nada ter saido de verdade.
    // Checa o estado de conexao de cada instancia uma vez por execucao e
    // exclui da rotacao qualquer uma que nao esteja "open".
    const connectedIds = await getConnectedInstanceIds(allInstances);

    const now = new Date();
    const brazilHour = (now.getUTCHours() - 3 + 24) % 24;

    // Libera leads presos em "enviando" (execução anterior travou/caiu antes de concluir)
    await supabase
      .from('disparo_leads')
      .update({ status: 'pendente' })
      .eq('status', 'enviando')
      .lt('sent_at', new Date(now.getTime() - 3 * 60 * 1000).toISOString());

    const { data: campaigns, error: campaignsErr } = await supabase
      .from('disparo_campanhas')
      .select('*')
      .eq('status', 'ativo')
      .lte('next_send_at', now.toISOString());
    if (campaignsErr) console.error('disparo-runner: falha ao buscar campanhas elegiveis:', campaignsErr.message);

    if (!campaigns?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;

    for (const camp of campaigns) {
      if (brazilHour < camp.safe_hour_start || brazilHour >= camp.safe_hour_end) {
        const hoursUntilSafe = ((camp.safe_hour_start + 3 - now.getUTCHours() + 24) % 24) || 24;
        const nextSafe = new Date(now.getTime() + hoursUntilSafe * 60 * 60 * 1000);
        await supabase.from('disparo_campanhas')
          .update({ next_send_at: nextSafe.toISOString() })
          .eq('id', camp.id);
        continue;
      }

      const todayBR = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { count: sentToday } = await supabase
        .from('disparo_leads')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', camp.id)
        .eq('status', 'enviado')
        .gte('sent_at', todayBR + 'T00:00:00+00:00');

      if ((sentToday ?? 0) >= camp.daily_limit) {
        const tomorrow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours((camp.safe_hour_start + 3) % 24, 0, 0, 0);
        await supabase.from('disparo_campanhas')
          .update({ next_send_at: tomorrow.toISOString() })
          .eq('id', camp.id);
        continue;
      }

      const { data: candidate } = await supabase
        .from('disparo_leads')
        .select('id')
        .eq('campanha_id', camp.id)
        .eq('status', 'pendente')
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!candidate) {
        await supabase.from('disparo_campanhas')
          .update({ status: 'concluido' })
          .eq('id', camp.id);
        continue;
      }

      // Claim atômico: marca 'enviando' ANTES de enviar — evita duplicata se o
      // cron sobrepõe (uma execução ainda processando quando a próxima começa).
      const { data: claimedRows, error: claimErr } = await supabase
        .from('disparo_leads')
        .update({ status: 'enviando', sent_at: now.toISOString() })
        .eq('id', candidate.id)
        .eq('status', 'pendente')
        .select('*');
      if (claimErr) console.error(`disparo-runner: falha ao reivindicar lead ${candidate.id}:`, claimErr.message);

      const lead = claimedRows?.[0];
      if (!lead) continue; // outra execução já pegou este lead (ou a reivindicação falhou -- ver log acima)

      const phone = formatPhone(lead.phone);
      if (!phone) {
        await supabase.from('disparo_leads')
          .update({ status: 'pulado', error_msg: 'Telefone inválido', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_skipped: (camp.leads_skipped ?? 0) + 1 })
          .eq('id', camp.id);
        continue;
      }

      const pinnedIds: string[] = (camp.evolution_config_ids?.length ? camp.evolution_config_ids : camp.evolution_config_id ? [camp.evolution_config_id] : []);
      const scoped = pinnedIds.length
        ? allInstances.filter((r: { id: string }) => pinnedIds.includes(r.id))
        : allInstances;
      const campInstances = (scoped.length ? scoped : allInstances).filter((r: { id: string }) => connectedIds.has(r.id));

      if (!campInstances.length) {
        // Nenhuma instância elegível está com sessão de WhatsApp aberta --
        // nem tenta enviar (evita o falso "enviado" que a Evolution API pode
        // devolver mesmo com a sessão fechada).
        const newErrors = (camp.consecutive_errors ?? 0) + 1;
        await supabase.from('disparo_leads')
          .update({ status: 'erro', error_msg: 'Nenhuma instância conectada disponível (sessão do WhatsApp fechada)', sent_at: now.toISOString() })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({
            leads_error: (camp.leads_error ?? 0) + 1,
            consecutive_errors: newErrors,
            next_send_at: now.toISOString(),
            ...(newErrors >= camp.max_errors_seq ? { status: 'erro' } : {}),
          })
          .eq('id', camp.id);
        continue;
      }

      // Rodízio: a instância da vez é escolhida por quantas mensagens a campanha já mandou,
      // as demais entram como fallback (nessa ordem) se a da vez falhar.
      const rotateIdx = (camp.leads_sent ?? 0) % campInstances.length;
      const orderedInstances = [...campInstances.slice(rotateIdx), ...campInstances.slice(0, rotateIdx)];

      const vars: Record<string, string> = {
        nome:  lead.nome ?? '',
        phone: lead.phone,
        ...(lead.variaveis ?? {}),
      };
      const message = applyTemplate(camp.template ?? '', vars);

      let sendOk    = false;
      let sendError = '';
      let sentInstanceId = '';
      let sentMessageId: string | null = null;
      let ambiguous = false;

      for (const inst of orderedInstances) {
        const rawBase = (inst.api_url as string).replace(/\/$/, '');
        const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
        try {
          let res: Response;
          if (camp.message_type && camp.message_type !== 'text') {
            res = await fetch(`${base}/message/sendMedia/${inst.instance_name}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({
                number:    phone,
                mediatype: camp.message_type,
                media:     camp.media_url,
                caption:   message || undefined,
                delay:     1200,
              }),
            });
          } else {
            res = await fetch(`${base}/message/sendText/${inst.instance_name}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({
                number: phone,
                text: message,
                delay: 1200,
                ...(camp.mention_everyone ? { mentionEveryone: true } : {}),
              }),
            });
          }
          const rawText = await res.text();
          if (!res.ok) throw new Error(`${res.status}: ${rawText.slice(0, 200)}`);

          let json: any = {};
          try { json = JSON.parse(rawText); } catch { /* resposta sem corpo json */ }
          sentMessageId = json?.key?.id ?? json?.data?.key?.id ?? null;

          sendOk = true;
          sentInstanceId = inst.id;
          break;
        } catch (e: unknown) {
          sendError = `[${inst.instance_name}] ${(e as Error).message}`;
          const isTimeout = e instanceof Error &&
            (e.name === 'TimeoutError' || e.name === 'AbortError' || /timeout|timed out/i.test(e.message));
          if (isTimeout) {
            // Pode já ter entregue — não tenta outra instância pro mesmo lead
            ambiguous = true;
            console.warn(`disparo-runner: ${inst.instance_name} deu timeout (envio incerto), não tentando outra instância`);
            break;
          }
          console.warn(`disparo-runner: ${inst.instance_name} falhou, tentando próxima...`);
        }
      }

      const sentAt = now.toISOString();
      // Delay só se enviou com sucesso — erro passa pro próximo lead imediatamente
      const delayS     = camp.delay_min_s + Math.random() * (camp.delay_max_s - camp.delay_min_s);
      const nextSendAt = new Date(now.getTime() + delayS * 1000).toISOString();

      if (sendOk) {
        await supabase.from('disparo_leads')
          .update({ status: 'enviado', sent_at: sentAt, error_msg: null, instance_id: sentInstanceId, evolution_message_id: sentMessageId })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({ leads_sent: (camp.leads_sent ?? 0) + 1, consecutive_errors: 0, next_send_at: nextSendAt })
          .eq('id', camp.id);
      } else {
        const newErrors = (camp.consecutive_errors ?? 0) + 1;
        await supabase.from('disparo_leads')
          .update({
            status: 'erro',
            error_msg: ambiguous ? `[verificar manualmente antes de reenviar] ${sendError}` : sendError,
            sent_at: sentAt,
          })
          .eq('id', lead.id);
        await supabase.from('disparo_campanhas')
          .update({
            leads_error:        (camp.leads_error ?? 0) + 1,
            consecutive_errors: newErrors,
            // sem delay — próximo lead é processado no cron seguinte sem espera
            next_send_at:       sentAt,
            ...(newErrors >= camp.max_errors_seq ? { status: 'erro' } : {}),
          })
          .eq('id', camp.id);
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    console.error('disparo-runner error:', e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

function formatPhone(raw: string): string | null {
  // JID de grupo — passa direto sem reformatar
  if (raw.includes('@g.us')) return raw;
  const d = raw.replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) return d;
  if (d.length === 12 && d.startsWith('55')) return d;
  if (d.length === 11) return '55' + d;
  if (d.length === 10) return '55' + d;
  return null;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

async function getAllInstances(
  db: ReturnType<typeof createClient>,
): Promise<Array<{ id: string; api_url: string; api_key: string; instance_name: string }>> {
  const { data: rows } = await db
    .from('evolution_config')
    .select('id, api_url, api_key, instance_name')
    .eq('ativo', true)
    .order('prioridade', { ascending: true });
  return rows ?? [];
}

async function getConnectedInstanceIds(
  instances: Array<{ id: string; api_url: string; api_key: string; instance_name: string }>,
): Promise<Set<string>> {
  const connected = new Set<string>();
  await Promise.all(instances.map(async (inst) => {
    const rawBase = inst.api_url.replace(/\/$/, '');
    const base = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    try {
      const res = await fetch(`${base}/instance/connectionState/${encodeURIComponent(inst.instance_name)}`, {
        headers: { apikey: inst.api_key },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const data = await res.json() as { instance?: { state?: string } };
      if (data.instance?.state === 'open') connected.add(inst.id);
    } catch (e: unknown) {
      console.warn(`disparo-runner: falha ao checar conexao de ${inst.instance_name}:`, (e as Error).message);
    }
  }));
  return connected;
}
