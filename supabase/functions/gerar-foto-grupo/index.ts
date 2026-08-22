import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Falha ao baixar imagem: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function applyToGroup(
  api_url: string, api_key: string, instance_name: string,
  groupJid: string, imageUrl: string,
) {
  const rawBase = api_url.replace(/\/$/, '');
  const base    = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
  const base64  = await urlToBase64(imageUrl);
  const url     = `${base}/group/updateGroupPicture/${instance_name}`;
  const body    = JSON.stringify({ groupJid, image: base64 });
  const hdrs    = { 'Content-Type': 'application/json', apikey: api_key };

  let res = await fetch(url, { method: 'PUT', headers: hdrs, body });
  if (res.status === 404 || res.status === 405) {
    res = await fetch(url, { method: 'POST', headers: hdrs, body });
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json() as {
      mode?:          'generate' | 'apply';
      lancamento_id:  string;
      tipo:           'lancamento' | 'npa';
      turma_nome?:    string;
      produto?:       string;
      data_evento?:   string;
      // apply mode
      foto_url?:      string;
      grupo_jid?:     string;
      // A chave da Evolution NAO vem do cliente: recebemos o id da instancia e
      // buscamos a chave aqui, com service_role. Antes o navegador precisava ler
      // `evolution_config.api_key` para montar esta chamada — e hoje o banco nem
      // deixa mais: a leitura daquela coluna foi revogada para `authenticated`.
      //
      // Nao existe campo `api_key` neste contrato de proposito. Aceitar uma chave
      // vinda de fora reabriria o buraco que acabamos de fechar.
      instancia_id?:  string;
    };

    const mode = body.mode ?? 'generate';

    // ── Modo APPLY: aplica foto existente no grupo ─────────────────────────────
    if (mode === 'apply') {
      const { foto_url, grupo_jid, instancia_id } = body;

      if (!foto_url || !grupo_jid || !instancia_id) {
        return new Response(JSON.stringify({ error: 'Faltou foto_url, grupo_jid ou instancia_id.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // A chave e lida aqui, com service_role, e nao sai daqui.
      const { data: inst } = await supabase
        .from('evolution_config')
        .select('api_url, api_key, instance_name')
        .eq('id', instancia_id)
        .maybeSingle();

      if (!inst) {
        return new Response(JSON.stringify({ error: 'Instância não encontrada.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await applyToGroup(inst.api_url, inst.api_key, inst.instance_name, grupo_jid, foto_url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Modo GENERATE: gera nova imagem com DALL-E ─────────────────────────────
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY não configurada no Supabase Secrets' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lancamento_id, tipo, turma_nome, produto, data_evento } = body;
    if (!lancamento_id || !turma_nome) {
      return new Response(JSON.stringify({ error: 'lancamento_id e turma_nome são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const produtoLabel = produto
      ? produto.charAt(0).toUpperCase() + produto.slice(1)
      : 'Curso';

    const prompt = [
      `Create a professional WhatsApp group cover image for "${turma_nome}".`,
      `Style: dark premium background (near-black or very deep navy/purple), minimalist, clean typography.`,
      `Include the course name "${turma_nome}" in bold white text centered.`,
      produto ? `Subject: ${produtoLabel}.` : '',
      data_evento ? `Event date: ${data_evento} — show this subtly below the title.` : '',
      `No photos of people. Abstract geometric elements or subtle gradient are ok.`,
      `Square format (1:1). High contrast. Professional quality.`,
    ].filter(Boolean).join(' ');

    const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model:           'dall-e-3',
        prompt,
        n:               1,
        size:            '1024x1024',
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!dalleRes.ok) {
      const err = await dalleRes.text();
      throw new Error(`DALL-E error ${dalleRes.status}: ${err.slice(0, 300)}`);
    }

    const dalleData = await dalleRes.json() as { data: { b64_json: string }[] };
    const b64 = dalleData.data[0]?.b64_json;
    if (!b64) throw new Error('DALL-E não retornou imagem');

    const binary = atob(b64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const storagePath = `${lancamento_id}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('fotos-grupo')
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });

    if (uploadErr) throw new Error(`Storage upload error: ${uploadErr.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('fotos-grupo')
      .getPublicUrl(storagePath);

    const table = tipo === 'npa' ? 'npa_eventos' : 'lancamentos';
    await supabase.from(table).update({ foto_grupo_url: publicUrl }).eq('id', lancamento_id);

    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
