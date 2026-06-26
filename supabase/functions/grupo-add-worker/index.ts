import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Busca jobs vencidos (até 5 por vez para não sobrecarregar) ────────────
    const { data: jobs, error: jobsErr } = await supabase
      .from('grupo_add_jobs')
      .select(`
        id, lancamento_id, lead_id, scheduled_at,
        lancamento_leads!inner (id, nome, whatsapp, fase),
        lancamentos!inner (id, grupo_lancamento_jid)
      `)
      .is('done_at', null)
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(5);

    if (jobsErr) throw new Error(jobsErr.message);
    if (!jobs?.length) return ok({ processed: 0, message: 'nenhum job pendente' });

    // ── Evolution API ─────────────────────────────────────────────────────────
    const { data: evoRows } = await supabase
      .from('evolution_config')
      .select('api_url, api_key, instance_name')
      .eq('ativo', true)
      .order('prioridade', { ascending: true })
      .limit(1);

    if (!evoRows?.length) {
      return ok({ error: 'nenhuma instância Evolution ativa' });
    }

    const evo     = evoRows[0];
    const rawBase = (evo.api_url as string).replace(/\/$/, '');
    const evoBase = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
    const headers = { 'Content-Type': 'application/json', apikey: evo.api_key as string };

    const results: { lead_id: string; result: string }[] = [];

    for (const job of jobs) {
      const lead     = (job as any).lancamento_leads;
      const lanc     = (job as any).lancamentos;
      const grupoJid = lanc?.grupo_lancamento_jid as string | null;
      const phone    = (lead?.whatsapp as string ?? '').replace(/\D/g, '');

      if (!phone || !grupoJid) {
        await supabase.from('grupo_add_jobs').update({
          done_at: new Date().toISOString(),
          result: 'erro',
          result_detail: !phone ? 'sem whatsapp' : 'grupo_lancamento_jid não configurado',
        }).eq('id', job.id);
        results.push({ lead_id: job.lead_id, result: 'erro' });
        continue;
      }

      const participant = `${phone}@s.whatsapp.net`;

      // ── Tenta adicionar ao grupo ──────────────────────────────────────────
      let adicionado = false;
      try {
        const addRes = await fetch(`${evoBase}/group/updateParticipant/${evo.instance_name}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            groupJid: grupoJid,
            action: 'add',
            participants: [participant],
          }),
        });

        const addBody = await addRes.json().catch(() => ({}));
        // Evolution retorna array com status por participante
        const participantResult = Array.isArray(addBody)
          ? addBody[0]
          : (Array.isArray(addBody?.participants) ? addBody.participants[0] : null);

        const status = participantResult?.status ?? participantResult?.content ?? '';
        // "added" ou status 200 = sucesso
        adicionado = addRes.ok && (
          String(status).toLowerCase().includes('added') ||
          participantResult?.status === 200 ||
          (addRes.ok && !String(status).toLowerCase().includes('error'))
        );

        console.log(`grupo-add-worker: lead=${job.lead_id} phone=${phone} addRes=${addRes.status} status="${status}" adicionado=${adicionado}`);
      } catch (e) {
        console.warn('grupo-add-worker: erro ao adicionar', (e as Error).message);
      }

      if (adicionado) {
        // Move lead para coluna "Grupo Lançamento" deste lançamento
        const { data: coluna } = await supabase
          .from('kanban_colunas')
          .select('id')
          .eq('lancamento_id', job.lancamento_id)
          .ilike('nome', '%grupo%lan%')
          .limit(1)
          .maybeSingle();

        const patch: Record<string, unknown> = { no_grupo: true };
        if (coluna?.id) patch.fase = coluna.id;

        await supabase.from('lancamento_leads').update(patch).eq('id', job.lead_id);
        await supabase.from('grupo_add_jobs').update({
          done_at: new Date().toISOString(),
          result: 'adicionado',
          result_detail: `adicionado ao grupo ${grupoJid}`,
        }).eq('id', job.id);

        results.push({ lead_id: job.lead_id, result: 'adicionado' });

      } else {
        // ── Não conseguiu adicionar → busca link de convite e manda mensagem ─
        let inviteLink = '';
        try {
          const invRes = await fetch(
            `${evoBase}/group/inviteCode/${evo.instance_name}?groupJid=${grupoJid}`,
            { method: 'GET', headers },
          );
          const invBody = await invRes.json().catch(() => ({}));
          const code = invBody?.inviteCode ?? invBody?.code ?? invBody?.invite_code ?? '';
          if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
        } catch (e) {
          console.warn('grupo-add-worker: erro ao buscar invite code', (e as Error).message);
        }

        const nomeLead = (lead?.nome as string) || 'você';
        const mensagem = inviteLink
          ? `Olá ${nomeLead}! 👋\n\nSua vaga no grupo do lançamento está confirmada!\n\n🔗 Acesse pelo link abaixo:\n${inviteLink}\n\nNos vemos lá! 🚀`
          : `Olá ${nomeLead}! 👋\n\nSua vaga no grupo do lançamento está confirmada!\nEm breve você receberá o link de acesso.\n\nQualquer dúvida, é só chamar!`;

        let msgEnviada = false;
        try {
          const msgRes = await fetch(`${evoBase}/message/sendText/${evo.instance_name}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ number: `${phone}@whatsapp.net`, text: mensagem, delay: 1200 }),
          });
          msgEnviada = msgRes.ok;
        } catch (e) {
          console.warn('grupo-add-worker: erro ao enviar mensagem', (e as Error).message);
        }

        await supabase.from('lancamento_leads').update({ bv_enviado: true, bv_enviado_em: new Date().toISOString() }).eq('id', job.lead_id);
        await supabase.from('grupo_add_jobs').update({
          done_at: new Date().toISOString(),
          result: msgEnviada ? 'mensagem_enviada' : 'erro',
          result_detail: msgEnviada
            ? (inviteLink ? `mensagem com link enviada` : 'mensagem sem link enviada')
            : 'falha ao enviar mensagem',
        }).eq('id', job.id);

        results.push({ lead_id: job.lead_id, result: msgEnviada ? 'mensagem_enviada' : 'erro' });
      }
    }

    return ok({ processed: results.length, results });

  } catch (e: unknown) {
    console.error('grupo-add-worker error:', (e as Error).message);
    return ok({ error: (e as Error).message });
  }
});
