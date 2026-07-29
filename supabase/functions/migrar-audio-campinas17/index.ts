import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Descartável: script de migração de uso único. Baixa o áudio hoje hospedado
// no Google Drive (media_url errado: Content-Type "video/mp4" e link do Drive
// não aguenta envio em massa -- bloqueia após muitos downloads) e sobe pro
// Supabase Storage com Content-Type de áudio correto, atualizando a campanha.

const CAMPANHA_ID = 'da2b5c35-7bd7-4fa3-bf66-549c05ad44d5';
const SOURCE_URL = 'https://drive.google.com/uc?export=download&id=1HFXByx5T7fKBRPnlbGSvlDa9rz5JF6xp';
const BUCKET = 'conteudo-criativos';
const PATH = 'disparo-campanhas/audio-rodrygo-campinas-17.mp4';

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, step: 'fetch', status: res.status }), { status: 500 });
    }
    const buf = await res.arrayBuffer();

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(PATH, buf, {
      contentType: 'audio/mp4',
      upsert: true,
    });
    if (upErr) {
      return new Response(JSON.stringify({ ok: false, step: 'upload', error: upErr.message }), { status: 500 });
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(PATH);

    const { error: updErr } = await supabase
      .from('disparo_campanhas')
      .update({ media_url: pub.publicUrl })
      .eq('id', CAMPANHA_ID);
    if (updErr) {
      return new Response(JSON.stringify({ ok: false, step: 'update_campanha', error: updErr.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, newUrl: pub.publicUrl, bytes: buf.byteLength }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500 });
  }
});
