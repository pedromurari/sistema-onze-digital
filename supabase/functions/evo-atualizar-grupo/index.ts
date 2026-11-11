/**
 * evo-atualizar-grupo
 * Atualiza assunto (nome) e/ou descrição de um grupo no WhatsApp via
 * Evolution API. Sempre retorna HTTP 200 -- erros vem em { error: "..." }.
 *
 * Body: {
 *   groupJid: string,
 *   instance_name?: string,
 *   subject?: string,
 *   description?: string,
 * }
 * Sucesso: { ok: true }
 * Erro:    { error: string }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json() as {
      groupJid?: string;
      inviteCode?: string;
      instance_name?: string;
      subject?: string;
      description?: string;
      obter_link?: boolean;
    };

    let { groupJid } = body;
    const { inviteCode, instance_name, subject, description, obter_link } = body;

    if (!groupJid?.trim() && !inviteCode?.trim()) {
      return ok({ error: 'informe groupJid ou inviteCode' });
    }
    if (!subject?.trim() && !description?.trim() && !obter_link) {
      return ok({ error: 'informe subject, description e/ou obter_link' });
    }

    let query = sb.from('evolution_config').select('api_url, api_key, instance_name').eq('ativo', true);
    if (instance_name && instance_name !== '__priority__') {
      query = query.eq('instance_name', instance_name);
    } else {
      query = query.order('prioridade', { ascending: true }).limit(1);
    }
    const { data: instances, error: dbErr } = await query;

    if (dbErr) return ok({ error: `Erro ao buscar instância: ${dbErr.message}` });

    const inst = instances?.[0];
    if (!inst) return ok({ error: 'Nenhuma instância Evolution ativa encontrada no banco' });

    const base     = (inst.api_url as string).replace(/\/$/, '');
    const apikey   = inst.api_key as string;
    const instName = inst.instance_name as string;

    if (!groupJid?.trim() && inviteCode?.trim()) {
      const resInfo = await fetch(`${base}/group/inviteInfo/${instName}?inviteCode=${encodeURIComponent(inviteCode.trim())}`, {
        headers: { apikey },
      });
      const txtInfo = await resInfo.text();
      if (!resInfo.ok) return ok({ error: `Evolution (inviteInfo) ${resInfo.status}: ${txtInfo.slice(0, 300)}` });
      let jsonInfo: any;
      try { jsonInfo = JSON.parse(txtInfo); } catch { jsonInfo = {}; }
      groupJid = jsonInfo?.id?._serialized ?? jsonInfo?.id ?? jsonInfo?.groupJid ?? jsonInfo?.data?.id?._serialized ?? '';
      if (!groupJid) return ok({ error: `Não encontrei o groupJid a partir do inviteCode. Resposta: ${txtInfo.slice(0, 200)}` });
    }

    const resultados: Record<string, unknown> = { groupJid };

    if (subject?.trim()) {
      const res = await fetch(`${base}/group/updateGroupSubject/${instName}`, {
        method: 'POST',
        headers: { apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupJid, subject: subject.trim() }),
      });
      const txt = await res.text();
      if (!res.ok) return ok({ error: `Evolution (subject) ${res.status}: ${txt.slice(0, 300)}` });
      resultados.subject = 'ok';
    }

    if (description?.trim()) {
      const res = await fetch(`${base}/group/updateGroupDescription/${instName}`, {
        method: 'POST',
        headers: { apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupJid, description: description.trim() }),
      });
      const txt = await res.text();
      if (!res.ok) return ok({ error: `Evolution (description) ${res.status}: ${txt.slice(0, 300)}` });
      resultados.description = 'ok';
    }

    if (obter_link) {
      const res = await fetch(`${base}/group/inviteCode/${instName}?groupJid=${encodeURIComponent(groupJid!)}`, {
        headers: { apikey },
      });
      const txt = await res.text();
      if (!res.ok) return ok({ error: `Evolution (inviteCode) ${res.status}: ${txt.slice(0, 300)}` });
      let json: any;
      try { json = JSON.parse(txt); } catch { json = {}; }
      const codigo = json?.inviteCode ?? json?.code ?? json?.data?.inviteCode ?? '';
      resultados.link = codigo ? `https://chat.whatsapp.com/${codigo}` : null;
    }

    return ok({ ok: true, instance: instName, ...resultados });

  } catch (err: any) {
    console.error('evo-atualizar-grupo unhandled error:', err);
    return ok({ error: `Erro interno: ${err.message ?? String(err)}` });
  }
});
