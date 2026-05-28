/**
 * evo-criar-grupo
 * Cria um grupo no WhatsApp via Evolution API.
 * Opcionalmente adiciona participantes e define a foto do grupo.
 *
 * Body: {
 *   subject: string,
 *   instance_name?: string,
 *   participants?: string[],   // números no formato 55119... (sem @s.whatsapp.net)
 *   photo_base64?: string,     // imagem em base64 puro (sem prefixo data:...)
 * }
 * Retorna: { jid: string, subject: string, instance: string }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { subject, instance_name, participants, photo_base64 } = await req.json() as {
      subject: string;
      instance_name?: string;
      participants?: string[];
      photo_base64?: string;
    };

    if (!subject?.trim()) {
      return new Response(JSON.stringify({ error: 'subject obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Buscar instância Evolution ─────────────────────────────────────────────
    let query = sb.from('evolution_config').select('api_url, api_key, instance_name').eq('ativo', true);
    if (instance_name && instance_name !== '__priority__') {
      query = query.eq('instance_name', instance_name);
    } else {
      query = query.order('prioridade', { ascending: true }).limit(1);
    }
    const { data: instances } = await query;
    const inst = instances?.[0];

    if (!inst) {
      return new Response(JSON.stringify({ error: 'Nenhuma instância Evolution ativa encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base     = (inst.api_url as string).replace(/\/$/, '');
    const apikey   = inst.api_key as string;
    const instName = inst.instance_name as string;

    // ── Criar grupo via Evolution API ─────────────────────────────────────────
    // POST /group/create/{instanceName}
    const res = await fetch(`${base}/group/create/${instName}`, {
      method: 'POST',
      headers: { apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject.trim(),
        participants: [], // Criado só com o admin; participantes adicionados em seguida
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Evolution API ${res.status}: ${txt}`);
    }

    const json = await res.json();

    // Evolution retorna: { id: { _serialized: "xxx@g.us" }, ... }
    // ou { groupJid: "xxx@g.us" } dependendo da versão
    const jid =
      json?.id?._serialized ??
      json?.id ??
      json?.groupJid ??
      json?.group_jid ??
      json?.data?.id?._serialized ??
      '';

    if (!jid) {
      console.error('Resposta da Evolution:', JSON.stringify(json));
      throw new Error('JID não encontrado na resposta da Evolution API');
    }

    // ── Adicionar participantes (se fornecidos) ────────────────────────────────
    const participantErrors: string[] = [];
    if (participants && participants.length > 0) {
      // Normalizar: garante formato DDI+DDD+número@s.whatsapp.net
      const participantsJid = participants
        .map(p => {
          const num = p.replace(/\D/g, '');
          return num.includes('@') ? num : `${num}@s.whatsapp.net`;
        })
        .filter(Boolean);

      try {
        const addRes = await fetch(`${base}/group/updateParticipant/${instName}`, {
          method: 'POST',
          headers: { apikey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupJid: jid, action: 'add', participants: participantsJid }),
        });
        if (!addRes.ok) {
          const txt = await addRes.text();
          participantErrors.push(`Participantes: ${addRes.status} ${txt}`);
          console.warn('Erro ao adicionar participantes:', txt);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        participantErrors.push(`Participantes: ${msg}`);
        console.warn('Erro ao adicionar participantes:', msg);
      }
    }

    // ── Atualizar foto do grupo (se fornecida) ─────────────────────────────────
    if (photo_base64) {
      try {
        const picRes = await fetch(`${base}/group/updateGroupPicture/${instName}`, {
          method: 'PUT',
          headers: { apikey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupJid: jid, image: photo_base64 }),
        });
        if (!picRes.ok) {
          const txt = await picRes.text();
          console.warn('Erro ao atualizar foto do grupo:', txt);
        }
      } catch (e) {
        console.warn('Erro ao atualizar foto do grupo:', e);
      }
    }

    return new Response(
      JSON.stringify({
        jid,
        subject: subject.trim(),
        instance: instName,
        warnings: participantErrors.length > 0 ? participantErrors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('evo-criar-grupo error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
