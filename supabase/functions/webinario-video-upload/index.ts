/**
 * webinario-video-upload — recebe um arquivo de vídeo (multipart/form-data)
 * e sobe pro bucket R2 do webinário, atualizando o registro em `webinarios`.
 *
 * Body (multipart/form-data):
 *   file   File   — o vídeo (.mp4)
 *   slug   string — slug do webinário (ex: 'escuta-psicanalitica')
 *   tipo   string — 'completo' (grava em video_url) ou 'captura' (grava em captura_video_url)
 *
 * Exige permissão admin de 'webinario' (tem_permissao).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Não autorizado.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const comoUsuario = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: pode } = await comoUsuario.rpc('tem_permissao', { p_recurso: 'webinario', p_acao: 'editar' });
    if (!pode) {
      return new Response(JSON.stringify({ ok: false, error: 'Sem permissão.' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const form = await req.formData();
    const file = form.get('file');
    const slug = String(form.get('slug') ?? '').trim();
    const tipo = String(form.get('tipo') ?? '').trim();

    if (!(file instanceof File) || !slug || (tipo !== 'completo' && tipo !== 'captura')) {
      return new Response(JSON.stringify({ ok: false, error: 'file, slug e tipo (completo|captura) são obrigatórios.' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const bucket = Deno.env.get('R2_BUCKET')!;
    const endpoint = Deno.env.get('R2_ENDPOINT')!;
    const publicBase = Deno.env.get('R2_PUBLIC_BASE')!;
    const r2 = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });

    const key = `webinarios/${slug}${tipo === 'captura' ? '-captura' : ''}.mp4`;
    const putRes = await r2.fetch(`${endpoint}/${bucket}/${key}`, {
      method: 'PUT',
      body: file.stream(),
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(file.size) },
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return new Response(JSON.stringify({ ok: false, error: `R2 ${putRes.status}: ${txt.slice(0, 300)}` }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const url = `${publicBase}/${key}`;
    const coluna = tipo === 'captura' ? 'captura_video_url' : 'video_url';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: dbErr } = await admin.from('webinarios').update({ [coluna]: url }).eq('slug', slug);
    if (dbErr) {
      return new Response(JSON.stringify({ ok: false, error: `Upload ok mas falhou salvar no banco: ${dbErr.message}`, url }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, url }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
