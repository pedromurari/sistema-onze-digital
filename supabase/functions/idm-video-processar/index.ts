import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Processa UM job de video por chamada (tick via pg_cron a cada 1min) -- nunca
// varios de uma vez, pra nao estourar o tempo de execucao da function. Cada
// passo (transcricao, render) e' uma etapa curta o suficiente pra caber numa
// unica invocacao; jobs maiores retomam no proximo tick se precisar.
//
// Estados (Modo B -- own_footage, unico modo implementado por enquanto):
//   queued -> transcribing -> rendering -> ready_for_review
//                                       \-> failed (em qualquer passo)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

type PalavraTranscrita = { word: string; start: number; end: number };
type Bloco = {
  order: number; text: string; image_prompt: string; movement_type: string;
  emphasis_words?: string[]; sfx_tag?: 'teclado' | 'sino' | 'notificacao' | null;
  figure_name?: string | null; figure_role?: string | null;
};

async function marcarFalha(supabase: any, jobId: string, mensagem: string) {
  await supabase.from('video_jobs').update({
    status: 'failed', error_message: mensagem.slice(0, 2000), processing_lock_at: null, updated_at: new Date().toISOString(),
  }).eq('id', jobId);
}

// Trava (lease) de processamento: passos com varias chamadas sequenciais (TTS,
// Whisper, geracao de imagem) podem passar do intervalo de 1 min do cron: sem
// isso, um segundo tick pega o MESMO job ainda no mesmo status e reprocessa os
// blocos ja feitos em paralelo -- foi o que estourou o rate limit da OpenAI no
// primeiro teste real. O lease expira sozinho depois de 5min pra um job que
// travou por erro nao ficar preso pra sempre.
const LEASE_MS = 5 * 60 * 1000;

async function reivindicarJob(supabase: any, jobId: string, statusAtual: string): Promise<boolean> {
  const agora = new Date();
  const limite = new Date(agora.getTime() - LEASE_MS).toISOString();
  const { data } = await supabase
    .from('video_jobs')
    .update({ processing_lock_at: agora.toISOString() })
    .eq('id', jobId).eq('status', statusAtual)
    .or(`processing_lock_at.is.null,processing_lock_at.lt.${limite}`)
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

async function transcreverComWhisper(openaiKey: string, audioUrl: string): Promise<{ palavras: PalavraTranscrita[]; duracao: number }> {
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!audioRes.ok) throw new Error(`Falha ao baixar audio pra transcrever: ${audioRes.status}`);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.append('file', audioBlob, 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Whisper falhou (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { words?: { word: string; start: number; end: number }[]; duration?: number };
  if (!data.words?.length) throw new Error('Whisper nao retornou timestamps por palavra');
  return {
    palavras: data.words.map(w => ({ word: w.word, start: w.start, end: w.end })),
    duracao: data.duration ?? data.words[data.words.length - 1].end,
  };
}

// Sem marcacao manual de enfase, estima pontos de zoom por uma heuristica
// simples sobre o proprio transcript (a API do Whisper nao expoe energia/pitch
// por palavra): inicio de frase depois de uma pausa >0.4s, ou a palavra mais
// "longa" (falada mais devagar, geralmente carregada) numa janela de ~4s.
// Nunca mais de 1 ponto a cada 4s pra nao virar zoom toda hora.
function estimarPontosDeEnfase(palavras: PalavraTranscrita[]): { time: number }[] {
  const candidatos: { time: number; peso: number }[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    const anterior = palavras[i - 1];
    const duracao = p.end - p.start;
    const posPausa = anterior && (p.start - anterior.end) > 0.4;
    const peso = duracao + (posPausa ? 0.3 : 0);
    candidatos.push({ time: p.start, peso });
  }
  candidatos.sort((a, b) => b.peso - a.peso);

  const escolhidos: { time: number }[] = [];
  for (const c of candidatos) {
    if (escolhidos.some(e => Math.abs(e.time - c.time) < 4)) continue;
    escolhidos.push({ time: c.time });
    if (escolhidos.length >= 8) break;
  }
  return escolhidos.sort((a, b) => a.time - b.time);
}

async function chamarWorker(supabase: any, endpoint: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { data: workerCfg } = await supabase.rpc('get_idm_reels_worker_config');
  const url = workerCfg?.[0]?.url as string | undefined;
  const secret = workerCfg?.[0]?.secret as string | undefined;
  if (!url || !secret) throw new Error('Worker de video nao configurado (Vault vazio)');

  const res = await fetch(`${url}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-video-worker-key': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(290_000),
  });
  if (!res.ok) throw new Error(`Worker ${endpoint} respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

// ── Modo A (ai_generated): narração por bloco via TTS, imagem de cena via
// Wikimedia Commons (arte classica/arquivo historico). Nada disso existe pro
// Modo B (own_footage).

async function gerarNarracaoTTS(openaiKey: string, texto: string): Promise<Uint8Array> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: texto, response_format: 'mp3' }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`TTS OpenAI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Imagem de cena: pintura classica ou foto de arquivo historico real via
// Wikimedia Commons (busca gratuita, sem chave) -- padrao de edicao premium.
// So aceita resultado com licenca de dominio publico ou CC0 (nunca uma que
// exija atribuicao visivel -- nao ha onde por credito no video). Se nenhum
// resultado elegivel for encontrado, cai pro Pexels como rede de seguranca
// (nunca trava o job so por falta de imagem).
async function buscarImagemWikimedia(query: string): Promise<Uint8Array | null> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&format=json&origin=*`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Sistema11dsReelsIDM/1.0 (contato: 11digitalstrategy@gmail.com)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Wikimedia Commons error ${res.status}`);
  const data = await res.json() as {
    query?: { pages?: Record<string, {
      imageinfo?: { url: string; mime: string; extmetadata?: { LicenseShortName?: { value?: string } } }[];
    }> };
  };
  const paginas = Object.values(data.query?.pages ?? {});
  for (const pagina of paginas) {
    const info = pagina.imageinfo?.[0];
    if (!info?.url || !/^image\/(jpeg|png|webp)$/.test(info.mime ?? '')) continue;
    const licenca = (info.extmetadata?.LicenseShortName?.value ?? '').toLowerCase();
    const licencaLivre = licenca.includes('public domain') || licenca.includes('cc0') || licenca.startsWith('pd');
    if (!licencaLivre) continue;

    const imgRes = await fetch(info.url, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) continue;
    return new Uint8Array(await imgRes.arrayBuffer());
  }
  return null;
}

// Pexels agora e' so a rede de seguranca do Wikimedia (ver buscarImagemDeCena
// abaixo) -- fica pra quando a busca de arte/arquivo nao acha nada elegivel.
async function buscarImagemPexels(pexelsKey: string, query: string, tentativa = 1): Promise<Uint8Array> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    if (res.status === 429 && tentativa < 3) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      return buscarImagemPexels(pexelsKey, query, tentativa + 1);
    }
    throw new Error(`Pexels error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json() as { photos: { src: { large2x?: string; large?: string; original?: string } }[] };
  const foto = data.photos[0];
  const fotoUrl = foto?.src.large2x ?? foto?.src.large ?? foto?.src.original;
  if (!fotoUrl) throw new Error(`Pexels nao encontrou nenhuma foto pra: "${query.slice(0, 80)}"`);

  const imgRes = await fetch(fotoUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Falha ao baixar foto do Pexels: ${imgRes.status}`);
  return new Uint8Array(await imgRes.arrayBuffer());
}

async function buscarImagemDeCena(pexelsKey: string | null, query: string): Promise<Uint8Array> {
  const daWikimedia = await buscarImagemWikimedia(query);
  if (daWikimedia) return daWikimedia;
  if (!pexelsKey) throw new Error(`Wikimedia nao encontrou imagem elegivel pra "${query.slice(0, 80)}" e o Pexels (rede de seguranca) nao esta configurado`);
  return buscarImagemPexels(pexelsKey, query);
}

// Sorteia 1 arquivo de audio (musica de fundo ou SFX) de uma pasta do Storage
// -- usado pro pacote curado de musica/SFX (sem API viva rodando na esteira).
async function sortearArquivoDoStorage(supabase: any, pasta: string): Promise<string | null> {
  const { data } = await supabase.storage.from('idm-reels').list(pasta);
  const arquivos = ((data ?? []) as { name: string }[]).filter(f => f.name && !f.name.startsWith('.'));
  if (!arquivos.length) return null;
  const escolhido = arquivos[Math.floor(Math.random() * arquivos.length)];
  return supabase.storage.from('idm-reels').getPublicUrl(`${pasta}/${escolhido.name}`).data.publicUrl;
}

type TranscricaoBloco = { duracao: number; palavras: PalavraTranscrita[] };

// Transcript de cada bloco (duracao + palavras com tempo relativo a esse
// clipe, 0..duracao) fica guardado no storage -- evita coluna nova em
// video_jobs so pra saber a janela de tempo/legenda de cada cena no passo de
// render. Usado tanto pra saber a duracao exata quanto pra gerar a legenda
// karaoke JA na renderizacao daquela cena (ver render-scene no worker).
async function carregarTranscricoesDosBlocos(supabase: any, jobId: string): Promise<TranscricaoBloco[]> {
  const { data } = await supabase
    .from('video_assets')
    .select('block_order, storage_url')
    .eq('job_id', jobId)
    .eq('asset_type', 'transcript_json')
    .not('block_order', 'is', null)
    .order('block_order', { ascending: true });
  const lista = (data ?? []) as { block_order: number; storage_url: string }[];
  const transcricoes: TranscricaoBloco[] = [];
  for (const item of lista) {
    const res = await fetch(item.storage_url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Falha ao baixar transcript do bloco ${item.block_order}`);
    transcricoes[item.block_order] = await res.json() as TranscricaoBloco;
  }
  return transcricoes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY nao configurada' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    // ── Passo transcribing: pega 1 job queued, extrai audio + transcreve ──────
    const { data: jobQueued } = await supabase
      .from('video_jobs')
      .select('id, mode, raw_video_url')
      .eq('mode', 'own_footage')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobQueued) {
      // Reivindica o job na hora (update condicional) pra evitar dois ticks
      // processando o mesmo job se um tick anterior ainda estiver rodando.
      const { data: reivindicado } = await supabase
        .from('video_jobs')
        .update({ status: 'transcribing', updated_at: new Date().toISOString() })
        .eq('id', jobQueued.id).eq('status', 'queued')
        .select('id').maybeSingle();

      if (reivindicado) {
        try {
          if (!jobQueued.raw_video_url) throw new Error('Job sem raw_video_url');
          const audioPath = `${jobQueued.id}/audio.mp3`;
          const { data: signedUpload, error: signedErr } = await supabase.storage
            .from('idm-reels').createSignedUploadUrl(audioPath, { upsert: true });
          if (signedErr || !signedUpload?.signedUrl) throw new Error(`Falha ao preparar upload do audio: ${signedErr?.message}`);

          const resultado = await chamarWorker(supabase, '/api/extract-audio', {
            video_url: jobQueued.raw_video_url,
            upload_url: signedUpload.signedUrl,
          });
          if (!resultado.ok) throw new Error(resultado.error ?? 'extract-audio falhou');

          const audioUrl = supabase.storage.from('idm-reels').getPublicUrl(audioPath).data.publicUrl;
          const { palavras } = await transcreverComWhisper(openaiKey, audioUrl);

          // Guarda o transcript completo no storage (json publico) pro passo de
          // render buscar depois, sem precisar re-transcrever nem carregar tudo
          // na propria linha de video_jobs.
          const transcriptPath = `${jobQueued.id}/transcript.json`;
          const { data: signedTranscript } = await supabase.storage
            .from('idm-reels').createSignedUploadUrl(transcriptPath, { upsert: true });
          if (signedTranscript?.signedUrl) {
            await fetch(signedTranscript.signedUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
              body: JSON.stringify(palavras),
            });
          }
          const transcriptUrl = supabase.storage.from('idm-reels').getPublicUrl(transcriptPath).data.publicUrl;
          await supabase.from('video_assets').insert({
            job_id: jobQueued.id, asset_type: 'transcript_json', storage_url: transcriptUrl,
          });

          await supabase.from('video_jobs').update({
            status: 'rendering', updated_at: new Date().toISOString(),
          }).eq('id', jobQueued.id);

          return new Response(JSON.stringify({ ok: true, job_id: jobQueued.id, passo: 'transcribing_concluido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e: unknown) {
          await marcarFalha(supabase, jobQueued.id, (e as Error).message);
          return new Response(JSON.stringify({ ok: false, job_id: jobQueued.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ── Passo rendering: pega 1 job rendering, renderiza o video final ────────
    const { data: jobRendering } = await supabase
      .from('video_jobs')
      .select('id, raw_video_url, manual_emphasis_points')
      .eq('mode', 'own_footage')
      .eq('status', 'rendering')
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobRendering && await reivindicarJob(supabase, jobRendering.id, 'rendering')) {
      try {
        const { data: transcriptAsset } = await supabase
          .from('video_assets')
          .select('storage_url')
          .eq('job_id', jobRendering.id)
          .eq('asset_type', 'transcript_json')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!transcriptAsset?.storage_url) throw new Error('Transcript nao encontrado pra este job');

        const transcriptRes = await fetch(transcriptAsset.storage_url, { signal: AbortSignal.timeout(20_000) });
        if (!transcriptRes.ok) throw new Error('Falha ao baixar transcript salvo');
        const palavras = await transcriptRes.json() as PalavraTranscrita[];

        const enfaseManual = Array.isArray(jobRendering.manual_emphasis_points)
          ? jobRendering.manual_emphasis_points
          : null;
        const enfases = enfaseManual?.length ? enfaseManual : estimarPontosDeEnfase(palavras);

        const finalPath = `${jobRendering.id}/final.mp4`;
        const { data: signedFinal, error: signedErr } = await supabase.storage
          .from('idm-reels').createSignedUploadUrl(finalPath, { upsert: true });
        if (signedErr || !signedFinal?.signedUrl) throw new Error(`Falha ao preparar upload do video final: ${signedErr?.message}`);

        // O Modo B nao tem cliente vinculado -- como hoje so existe um cliente
        // ativo no sistema, a logo padrao e' a dele. Se um dia houver mais de
        // um cliente ativo ao mesmo tempo, isso precisa de escolha explicita.
        const { data: clienteAtivo } = await supabase.from('conteudo_clientes').select('logo_url').eq('ativo', true).limit(1).maybeSingle();

        const resultado = await chamarWorker(supabase, '/api/render', {
          base_video_url: jobRendering.raw_video_url,
          upload_url: signedFinal.signedUrl,
          transcript_words: palavras,
          emphasis_points: enfases,
          sfx_at: [],
          logo_url: clienteAtivo?.logo_url ?? null,
        });
        if (!resultado.ok) throw new Error(resultado.error ?? 'render falhou');

        const finalUrl = supabase.storage.from('idm-reels').getPublicUrl(finalPath).data.publicUrl;
        await supabase.from('video_jobs').update({
          status: 'ready_for_review', final_video_url: finalUrl, processing_lock_at: null, updated_at: new Date().toISOString(),
        }).eq('id', jobRendering.id);

        return new Response(JSON.stringify({ ok: true, job_id: jobRendering.id, passo: 'ready_for_review' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        await marcarFalha(supabase, jobRendering.id, (e as Error).message);
        return new Response(JSON.stringify({ ok: false, job_id: jobRendering.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Modo A, passo generating_audio: TTS por bloco de cena ────────────────
    const { data: jobQueuedIA } = await supabase
      .from('video_jobs')
      .select('id, script_id')
      .eq('mode', 'ai_generated')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobQueuedIA) {
      const { data: reivindicadoIA } = await supabase
        .from('video_jobs')
        .update({ status: 'generating_audio', updated_at: new Date().toISOString() })
        .eq('id', jobQueuedIA.id).eq('status', 'queued')
        .select('id').maybeSingle();

      if (reivindicadoIA) {
        try {
          const { data: script, error: scriptErr } = await supabase.from('video_scripts').select('blocks').eq('id', jobQueuedIA.script_id).single();
          if (scriptErr || !script) throw new Error(`Roteiro nao encontrado: ${scriptErr?.message}`);
          const blocos = (script.blocks ?? []) as Bloco[];
          if (!blocos.length) throw new Error('Roteiro sem blocos de cena');

          // Pula bloco que ja tem audio pronto -- uma retentativa (falha parcial,
          // job resetado a mao) nao pode gastar de novo com blocos ja feitos.
          const { data: audiosProntos } = await supabase.from('video_assets').select('block_order').eq('job_id', jobQueuedIA.id).eq('asset_type', 'narration_audio').not('block_order', 'is', null);
          const blocosComAudio = new Set((audiosProntos ?? []).map((a: any) => a.block_order));

          for (const bloco of blocos) {
            if (blocosComAudio.has(bloco.order)) continue;
            const audioBytes = await gerarNarracaoTTS(openaiKey, bloco.text);
            const audioPath = `${jobQueuedIA.id}/block-${bloco.order}-audio.mp3`;
            const { error: upErr } = await supabase.storage.from('idm-reels').upload(audioPath, audioBytes, { contentType: 'audio/mpeg', upsert: true });
            if (upErr) throw new Error(`Falha ao subir audio do bloco ${bloco.order}: ${upErr.message}`);
            const audioUrl = supabase.storage.from('idm-reels').getPublicUrl(audioPath).data.publicUrl;
            await supabase.from('video_assets').insert({ job_id: jobQueuedIA.id, asset_type: 'narration_audio', block_order: bloco.order, storage_url: audioUrl });
          }

          await supabase.from('video_jobs').update({ status: 'transcribing', processing_lock_at: null, updated_at: new Date().toISOString() }).eq('id', jobQueuedIA.id);
          return new Response(JSON.stringify({ ok: true, job_id: jobQueuedIA.id, passo: 'generating_audio_concluido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e: unknown) {
          await marcarFalha(supabase, jobQueuedIA.id, (e as Error).message);
          return new Response(JSON.stringify({ ok: false, job_id: jobQueuedIA.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // ── Modo A, passo transcribing: Whisper por bloco + transcript final ─────
    const { data: jobTranscribingIA } = await supabase
      .from('video_jobs')
      .select('id, script_id')
      .eq('mode', 'ai_generated')
      .eq('status', 'transcribing')
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobTranscribingIA && await reivindicarJob(supabase, jobTranscribingIA.id, 'transcribing')) {
      try {
        const { data: audiosBlocos } = await supabase
          .from('video_assets')
          .select('block_order, storage_url')
          .eq('job_id', jobTranscribingIA.id)
          .eq('asset_type', 'narration_audio')
          .not('block_order', 'is', null)
          .order('block_order', { ascending: true });
        const lista = (audiosBlocos ?? []) as { block_order: number; storage_url: string }[];
        if (!lista.length) throw new Error('Audio dos blocos nao encontrado');

        let acumulado = 0;
        const palavrasFinais: PalavraTranscrita[] = [];
        for (const item of lista) {
          const { palavras, duracao } = await transcreverComWhisper(openaiKey, item.storage_url);

          const transcriptPath = `${jobTranscribingIA.id}/block-${item.block_order}-transcript.json`;
          const { data: signedTranscript } = await supabase.storage.from('idm-reels').createSignedUploadUrl(transcriptPath, { upsert: true });
          if (signedTranscript?.signedUrl) {
            await fetch(signedTranscript.signedUrl, {
              method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify({ duracao, palavras }),
            });
          }
          const transcriptUrl = supabase.storage.from('idm-reels').getPublicUrl(transcriptPath).data.publicUrl;
          await supabase.from('video_assets').insert({ job_id: jobTranscribingIA.id, asset_type: 'transcript_json', block_order: item.block_order, storage_url: transcriptUrl });

          for (const p of palavras) palavrasFinais.push({ word: p.word, start: p.start + acumulado, end: p.end + acumulado });
          acumulado += duracao;
        }

        const finalTranscriptPath = `${jobTranscribingIA.id}/transcript.json`;
        const { data: signedFinalTranscript } = await supabase.storage.from('idm-reels').createSignedUploadUrl(finalTranscriptPath, { upsert: true });
        if (signedFinalTranscript?.signedUrl) {
          await fetch(signedFinalTranscript.signedUrl, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(palavrasFinais),
          });
        }
        const finalTranscriptUrl = supabase.storage.from('idm-reels').getPublicUrl(finalTranscriptPath).data.publicUrl;
        await supabase.from('video_assets').insert({ job_id: jobTranscribingIA.id, asset_type: 'transcript_json', storage_url: finalTranscriptUrl });

        await supabase.from('video_jobs').update({ status: 'generating_scenes', processing_lock_at: null, updated_at: new Date().toISOString() }).eq('id', jobTranscribingIA.id);
        return new Response(JSON.stringify({ ok: true, job_id: jobTranscribingIA.id, passo: 'transcribing_concluido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        await marcarFalha(supabase, jobTranscribingIA.id, (e as Error).message);
        return new Response(JSON.stringify({ ok: false, job_id: jobTranscribingIA.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Modo A, passo generating_scenes: busca 1 imagem (Wikimedia Commons, fallback Pexels) por bloco ──
    const { data: jobScenesIA } = await supabase
      .from('video_jobs')
      .select('id, script_id')
      .eq('mode', 'ai_generated')
      .eq('status', 'generating_scenes')
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobScenesIA && await reivindicarJob(supabase, jobScenesIA.id, 'generating_scenes')) {
      try {
        // Pexels so entra como rede de seguranca (ver buscarImagemDeCena) --
        // sem chave configurada, o passo so falha se o Wikimedia tambem nao
        // achar nada elegivel pra um bloco especifico.
        const { data: pexelsKey } = await supabase.rpc('get_pexels_api_key');

        const { data: script, error: scriptErr } = await supabase.from('video_scripts').select('blocks, cliente_id').eq('id', jobScenesIA.script_id).single();
        if (scriptErr || !script) throw new Error(`Roteiro nao encontrado: ${scriptErr?.message}`);
        const blocos = (script.blocks ?? []) as Bloco[];

        // Mesma logica do passo de audio: pula bloco que ja tem imagem pronta.
        const { data: imagensProntas } = await supabase.from('video_assets').select('block_order').eq('job_id', jobScenesIA.id).eq('asset_type', 'scene_image');
        const blocosComImagem = new Set((imagensProntas ?? []).map((a: any) => a.block_order));

        for (const bloco of blocos) {
          if (blocosComImagem.has(bloco.order)) continue;
          const imagemBytes = await buscarImagemDeCena(pexelsKey ?? null, bloco.image_prompt);
          const imagePath = `${jobScenesIA.id}/block-${bloco.order}-scene.jpg`;
          const { error: upErr } = await supabase.storage.from('idm-reels').upload(imagePath, imagemBytes, { contentType: 'image/jpeg', upsert: true });
          if (upErr) throw new Error(`Falha ao subir imagem do bloco ${bloco.order}: ${upErr.message}`);
          const imageUrl = supabase.storage.from('idm-reels').getPublicUrl(imagePath).data.publicUrl;
          await supabase.from('video_assets').insert({ job_id: jobScenesIA.id, asset_type: 'scene_image', block_order: bloco.order, storage_url: imageUrl });

          // Entra no banco compartilhado pra poder ser reaproveitada depois (ex:
          // como key art de post) em vez de servir so pra esta cena. Nunca
          // derruba o job se isso falhar.
          await supabase.from('midia_imagens_reaproveitaveis').insert({
            cliente_id: script.cliente_id, image_url: imageUrl, image_prompt: bloco.image_prompt, origem: 'video_reels',
          }).then(() => {}, () => {});
        }

        await supabase.from('video_jobs').update({ status: 'rendering', processing_lock_at: null, updated_at: new Date().toISOString() }).eq('id', jobScenesIA.id);
        return new Response(JSON.stringify({ ok: true, job_id: jobScenesIA.id, passo: 'generating_scenes_concluido' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        await marcarFalha(supabase, jobScenesIA.id, (e as Error).message);
        return new Response(JSON.stringify({ ok: false, job_id: jobScenesIA.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Modo A, passo rendering: uma cena por tick, so finaliza quando todas
    // as cenas ja tiverem clipe pronto. Cada cena ja sai da sua propria chamada
    // com o acabamento completo (grade de cor, legenda karaoke, logo) queimado
    // -- rodar esse acabamento uma vez so sobre o video inteiro ja concatenado
    // (no passo de finalize) estourava o timeout de 140s da Vercel, o que
    // deixava o job preso em "rendering" pra sempre (fix anterior so resolveu
    // o Ken Burns em si, nao o acabamento). Ver lib/kenburns.ts no worker.
    const { data: jobRenderingIA } = await supabase
      .from('video_jobs')
      .select('id, script_id, music_track_url')
      .eq('mode', 'ai_generated')
      .eq('status', 'rendering')
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobRenderingIA && await reivindicarJob(supabase, jobRenderingIA.id, 'rendering')) {
      try {
        const { data: script, error: scriptErr } = await supabase.from('video_scripts').select('blocks, cliente_id, concept_word').eq('id', jobRenderingIA.script_id).single();
        if (scriptErr || !script) throw new Error(`Roteiro nao encontrado: ${scriptErr?.message}`);
        const blocos = (script.blocks ?? []) as Bloco[];

        // Musica de fundo e' sorteada uma vez por job (nao por cena) e fixada
        // na coluna -- retentativa nunca troca de faixa no meio do video.
        let musicTrackUrl = jobRenderingIA.music_track_url as string | null;
        if (!musicTrackUrl) {
          musicTrackUrl = await sortearArquivoDoStorage(supabase, 'audio/music');
          if (musicTrackUrl) {
            await supabase.from('video_jobs').update({ music_track_url: musicTrackUrl }).eq('id', jobRenderingIA.id).is('music_track_url', null);
          }
        }

        const [{ data: audiosBlocos }, { data: imagensBlocos }, { data: clipesProntos }] = await Promise.all([
          supabase.from('video_assets').select('block_order, storage_url').eq('job_id', jobRenderingIA.id).eq('asset_type', 'narration_audio').not('block_order', 'is', null),
          supabase.from('video_assets').select('block_order, storage_url').eq('job_id', jobRenderingIA.id).eq('asset_type', 'scene_image'),
          supabase.from('video_assets').select('block_order, storage_url').eq('job_id', jobRenderingIA.id).eq('asset_type', 'scene_clip'),
        ]);

        const clipesPorBloco = new Map(((clipesProntos ?? []) as { block_order: number; storage_url: string }[]).map(c => [c.block_order, c.storage_url]));
        const blocoFaltando = blocos.find(b => !clipesPorBloco.has(b.order));

        if (blocoFaltando) {
          // Ainda falta cena: renderiza SO essa, uma por tick, ja com legenda e logo.
          const { data: cliente } = script.cliente_id ? await supabase.from('conteudo_clientes').select('logo_url').eq('id', script.cliente_id).maybeSingle() : { data: null as { logo_url?: string | null } | null };
          const transcricoesPorBloco = await carregarTranscricoesDosBlocos(supabase, jobRenderingIA.id);
          const audio = (audiosBlocos as { block_order: number; storage_url: string }[] | null)?.find(a => a.block_order === blocoFaltando.order);
          const imagem = (imagensBlocos as { block_order: number; storage_url: string }[] | null)?.find(i => i.block_order === blocoFaltando.order);
          if (!audio) throw new Error(`Audio da cena ${blocoFaltando.order} nao encontrado`);
          if (!imagem) throw new Error(`Imagem da cena ${blocoFaltando.order} nao encontrada`);

          const clipPath = `${jobRenderingIA.id}/scene-clip-${blocoFaltando.order}.mp4`;
          const { data: signedClip, error: signedErr } = await supabase.storage.from('idm-reels').createSignedUploadUrl(clipPath, { upsert: true });
          if (signedErr || !signedClip?.signedUrl) throw new Error(`Falha ao preparar upload do clipe: ${signedErr?.message}`);

          // SFX contextual e' esparso -- so entra quando o Roteirista marcou
          // sfx_tag pra este bloco especifico.
          const sfxUrl = blocoFaltando.sfx_tag ? await sortearArquivoDoStorage(supabase, `audio/sfx/${blocoFaltando.sfx_tag}`) : null;

          const resultado = await chamarWorker(supabase, '/api/render-scene', {
            image_url: imagem.storage_url,
            audio_url: audio.storage_url,
            duracao: transcricoesPorBloco[blocoFaltando.order]?.duracao ?? 3,
            movement_type: blocoFaltando.movement_type,
            upload_url: signedClip.signedUrl,
            transcript_words: transcricoesPorBloco[blocoFaltando.order]?.palavras ?? [],
            emphasis_words: blocoFaltando.emphasis_words ?? [],
            concept_word: script.concept_word ?? null,
            logo_url: cliente?.logo_url ?? null,
            sfx_url: sfxUrl,
            figure_name: blocoFaltando.figure_name ?? null,
            figure_role: blocoFaltando.figure_role ?? null,
          });
          if (!resultado.ok) throw new Error(resultado.error ?? 'render-scene falhou');

          const clipUrl = supabase.storage.from('idm-reels').getPublicUrl(clipPath).data.publicUrl;
          await supabase.from('video_assets').insert({ job_id: jobRenderingIA.id, asset_type: 'scene_clip', block_order: blocoFaltando.order, storage_url: clipUrl });

          await supabase.from('video_jobs').update({ processing_lock_at: null, updated_at: new Date().toISOString() }).eq('id', jobRenderingIA.id);
          return new Response(JSON.stringify({ ok: true, job_id: jobRenderingIA.id, passo: `scene_clip_${blocoFaltando.order}_concluido` }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Todas as cenas ja saem prontas (acabamento+legenda+logo por cena):
        // finaliza so concatenando via stream-copy, sem re-encode.
        const clipUrls = blocos.map(b => clipesPorBloco.get(b.order)).filter((u): u is string => Boolean(u));
        if (clipUrls.length !== blocos.length) throw new Error('Faltam clipes de cena');

        const finalPath = `${jobRenderingIA.id}/final.mp4`;
        const { data: signedFinal, error: signedErr } = await supabase.storage.from('idm-reels').createSignedUploadUrl(finalPath, { upsert: true });
        if (signedErr || !signedFinal?.signedUrl) throw new Error(`Falha ao preparar upload do video final: ${signedErr?.message}`);

        const resultado = await chamarWorker(supabase, '/api/render-scenes', {
          upload_url: signedFinal.signedUrl,
          scene_clip_urls: clipUrls,
          music_track_url: musicTrackUrl,
        });
        if (!resultado.ok) throw new Error(resultado.error ?? 'render-scenes (finalize) falhou');

        const finalUrl = supabase.storage.from('idm-reels').getPublicUrl(finalPath).data.publicUrl;
        await supabase.from('video_jobs').update({ status: 'ready_for_review', final_video_url: finalUrl, processing_lock_at: null, updated_at: new Date().toISOString() }).eq('id', jobRenderingIA.id);

        return new Response(JSON.stringify({ ok: true, job_id: jobRenderingIA.id, passo: 'ready_for_review' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e: unknown) {
        await marcarFalha(supabase, jobRenderingIA.id, (e as Error).message);
        return new Response(JSON.stringify({ ok: false, job_id: jobRenderingIA.id, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ ok: true, mensagem: 'nada pendente' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
