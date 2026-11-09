/**
 * membros-upload-url — gera uma URL assinada (presigned) de PUT direto pro
 * bucket R2, pro admin subir vídeo/PDF de aula sem passar o arquivo pelo
 * Vercel nem por esta function (evita limite de tamanho de corpo de
 * requisição de ambos). O navegador recebe a URL e faz o PUT direto pro R2.
 *
 * Body (JSON):
 *   pasta        string — ex: 'mentoria-nps/05-nova-aula'
 *   filename     string — nome original do arquivo
 *   contentType  string — mime type do arquivo
 *
 * Exige usuário autenticado com profiles.role = 'admin' (projeto IDM Members).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Não autorizado.' }, 401);

    const comoUsuario = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ ok: false, error: 'Sessão inválida.' }, 401);

    const { data: profile } = await comoUsuario.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return json({ ok: false, error: 'Sem permissão.' }, 403);

    const body = await req.json().catch(() => null);
    const pasta = String(body?.pasta ?? '').trim();
    const filename = String(body?.filename ?? '').trim();
    const contentType = String(body?.contentType ?? '').trim() || 'application/octet-stream';

    if (!pasta || !filename) return json({ ok: false, error: 'pasta e filename são obrigatórios.' }, 400);

    const safePasta = pasta.replace(/[^a-zA-Z0-9\-\/]/g, '-').replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '');
    const safeName = filename.replace(/[^a-zA-Z0-9.\-]/g, '-');
    const key = `membros/${safePasta}/${Date.now()}-${safeName}`;

    const bucket = Deno.env.get('R2_BUCKET')!;
    const endpoint = Deno.env.get('R2_ENDPOINT')!;
    const publicBase = Deno.env.get('R2_PUBLIC_BASE')!;
    const r2 = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });

    const signed = await r2.sign(`${endpoint}/${bucket}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      aws: { signQuery: true },
    });

    return json({ ok: true, putUrl: signed.url, publicUrl: `${publicBase}/${key}`, contentType });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
