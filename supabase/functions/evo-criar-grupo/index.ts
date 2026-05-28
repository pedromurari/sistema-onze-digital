/**
 * evo-criar-grupo
 * Cria um grupo no WhatsApp via Evolution API.
 * Sempre retorna HTTP 200 — erros vêm em { error: "..." } no body.
 *
 * IMPORTANTE: Esta versão da Evolution API exige ≥1 participante no create.
 * Os participantes são passados direto na criação do grupo.
 *
 * Body: {
 *   subject: string,
 *   instance_name?: string,
 *   participants?: string[],   // pelo menos 1 obrigatório
 *   photo_base64?: string,
 * }
 * Sucesso: { jid: string, subject: string, instance: string }
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
      subject?: string;
      instance_name?: string;
      participants?: string[];
      photo_base64?: string;
    };

    const { subject, instance_name, participants, photo_base64 } = body;

    if (!subject?.trim()) return ok({ error: 'subject (nome do grupo) é obrigatório' });

    // Normaliza participantes → formato DDI+número@s.whatsapp.net
    const participantsJid = (participants ?? [])
      .map(p => { const n = p.replace(/\D/g, ''); return n ? `${n}@s.whatsapp.net` : ''; })
      .filter(Boolean);

    if (participantsJid.length === 0) {
      return ok({ error: 'Adicione pelo menos 1 número de participante. Esta versão da Evolution API exige ≥1 participante para criar o grupo.' });
    }

    // ── Buscar instância Evolution ─────────────────────────────────────────────
    let query = sb.from('evolution_config').select('api_url, api_key, instance_name').eq('ativo', true);
    if (instance_name && instance_name !== '__priority__') {
      query = query.eq('instance_name', instance_name);
    } else {
      query = query.order('prioridade', { ascending: true }).limit(1);
    }
    const { data: instances, error: dbErr } = await query;

    if (dbErr) {
      console.error('DB error:', dbErr);
      return ok({ error: `Erro ao buscar instância: ${dbErr.message}` });
    }

    const inst = instances?.[0];
    if (!inst) return ok({ error: 'Nenhuma instância Evolution ativa encontrada no banco' });

    const base     = (inst.api_url as string).replace(/\/$/, '');
    const apikey   = inst.api_key as string;
    const instName = inst.instance_name as string;

    console.log(`Criando grupo "${subject}" na instância "${instName}" com ${participantsJid.length} participante(s)`);

    // ── Criar grupo (participantes incluídos na criação) ───────────────────────
    let evoRes: Response;
    try {
      evoRes = await fetch(`${base}/group/create/${instName}`, {
        method: 'POST',
        headers: { apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          participants: participantsJid,  // passados direto no create
        }),
      });
    } catch (fetchErr: any) {
      console.error('Fetch error para Evolution API:', fetchErr);
      return ok({ error: `Não foi possível conectar à Evolution API: ${fetchErr.message}` });
    }

    const rawText = await evoRes.text();
    console.log(`Evolution API /group/create → ${evoRes.status}: ${rawText.slice(0, 500)}`);

    if (!evoRes.ok) {
      return ok({ error: `Evolution API retornou ${evoRes.status}: ${rawText.slice(0, 300)}` });
    }

    let json: any;
    try { json = JSON.parse(rawText); } catch { json = {}; }

    const jid =
      json?.id?._serialized ??
      json?.id ??
      json?.groupJid ??
      json?.group_jid ??
      json?.data?.id?._serialized ??
      json?.data?.groupJid ??
      '';

    if (!jid) {
      console.error('JID não encontrado. Resposta completa:', rawText);
      return ok({ error: `Grupo criado mas JID não encontrado. Resposta: ${rawText.slice(0, 200)}` });
    }

    // ── Atualizar foto (não-fatal) ─────────────────────────────────────────────
    if (photo_base64) {
      try {
        const picRes = await fetch(`${base}/group/updateGroupPicture/${instName}`, {
          method: 'PUT',
          headers: { apikey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupJid: jid, image: photo_base64 }),
        });
        if (!picRes.ok) console.warn('Foto:', await picRes.text());
      } catch (e: any) {
        console.warn('Foto error:', e.message);
      }
    }

    return ok({ jid, subject: subject.trim(), instance: instName });

  } catch (err: any) {
    console.error('evo-criar-grupo unhandled error:', err);
    return ok({ error: `Erro interno: ${err.message ?? String(err)}` });
  }
});
