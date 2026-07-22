import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { consolidarMarkdown } from './memoria.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function textoParaBase64(content: string) {
  const bytes = new TextEncoder().encode(content);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'equipe-11ds-memoria-sync',
  };
}

async function githubConfig(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.rpc('get_equipe_11ds_github_config');
  const token = data?.[0]?.token as string | undefined;
  const repo = data?.[0]?.repo as string | undefined;
  return token && repo ? { token, repo } : null;
}

async function shaAtual(token: string, repo: string, caminho: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} ao ler ${caminho}.`);
  const data = await res.json() as { sha?: string };
  return data.sha ?? null;
}

async function gravarGithub(token: string, repo: string, caminho: string, conteudo: string, sha: string | null) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `curadoria: sincroniza ${caminho}`,
      content: textoParaBase64(conteudo),
      ...(sha ? { sha } : {}),
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status} ao gravar ${caminho}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { content?: { sha?: string } };
  return data.content?.sha ?? null;
}

function proximoRetry(tentativas: number) {
  const minutos = Math.min(360, 2 ** Math.max(0, tentativas) * 5);
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

async function sincronizarCaminho(
  supabase: ReturnType<typeof createClient>,
  token: string,
  repo: string,
  caminho: string,
) {
  const { data: memorias, error } = await supabase
    .from('equipe_11ds_memorias')
    .select('id,resumo,regra,origem,prioridade,agentes_consumidores,status,created_at,tentativas_sync')
    .eq('caminho_obsidian', caminho)
    .in('status', ['ativa', 'pendente_sincronizacao'])
    .order('prioridade', { ascending: false })
    .order('created_at');
  if (error) throw new Error(`Falha ao carregar memórias de ${caminho}: ${error.message}`);
  const pendentes = (memorias ?? []).filter(memoria => memoria.status === 'pendente_sincronizacao');
  if (!pendentes.length) return { caminho, sincronizadas: 0 };
  try {
    const sha = await shaAtual(token, repo, caminho);
    const novoSha = await gravarGithub(token, repo, caminho, consolidarMarkdown(caminho, memorias ?? []), sha);
    const ids = pendentes.map(memoria => memoria.id);
    const agora = new Date().toISOString();
    const { error: updateError } = await supabase.from('equipe_11ds_memorias').update({
      status: 'ativa',
      github_sha: novoSha,
      sincronizada_em: agora,
      proxima_tentativa_em: null,
      erro_sync: null,
      updated_at: agora,
    }).in('id', ids);
    if (updateError) throw new Error(`GitHub sincronizado, mas o índice falhou: ${updateError.message}`);
    return { caminho, sincronizadas: ids.length, sha: novoSha };
  } catch (error) {
    const mensagem = (error as Error).message;
    await Promise.all(pendentes.map(memoria => {
      const tentativas = Math.min(10, Number(memoria.tentativas_sync ?? 0) + 1);
      return supabase.from('equipe_11ds_memorias').update({
        tentativas_sync: tentativas,
        proxima_tentativa_em: tentativas >= 10 ? null : proximoRetry(tentativas),
        erro_sync: mensagem.slice(0, 1200),
        updated_at: new Date().toISOString(),
      }).eq('id', memoria.id);
    }));
    return { caminho, sincronizadas: 0, erro: mensagem };
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: 'Configuração do Supabase ausente.' }, 500);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || req.headers.get('x-cron-key') !== String(cronSecret)) return json({ ok: false, error: 'Não autorizado.' }, 401);

  try {
    const body = await req.json().catch(() => ({})) as { memoria_ids?: string[] };
    const agora = new Date().toISOString();
    let query = supabase
      .from('equipe_11ds_memorias')
      .select('id,caminho_obsidian')
      .eq('status', 'pendente_sincronizacao')
      .not('caminho_obsidian', 'is', null)
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agora}`)
      .order('created_at')
      .limit(50);
    const ids = Array.isArray(body.memoria_ids) ? body.memoria_ids.filter(Boolean).slice(0, 50) : [];
    if (ids.length) query = query.in('id', ids);
    const { data: pendentes, error } = await query;
    if (error) throw new Error(`Falha ao buscar fila de memória: ${error.message}`);
    const caminhos = [...new Set((pendentes ?? []).map(item => item.caminho_obsidian as string).filter(Boolean))].slice(0, 20);
    if (!caminhos.length) return json({ ok: true, processadas: 0, sincronizadas: 0, resultados: [] });
    const config = await githubConfig(supabase);
    if (!config) throw new Error('Cofre GitHub/Obsidian não configurado.');
    const resultados = [];
    for (const caminho of caminhos) resultados.push(await sincronizarCaminho(supabase, config.token, config.repo, caminho));
    const sincronizadas = resultados.reduce((total, item) => total + Number(item.sincronizadas ?? 0), 0);
    return json({ ok: true, processadas: caminhos.length, sincronizadas, resultados });
  } catch (error) {
    const mensagem = (error as Error).message;
    console.error('equipe-11ds-memoria-sync:', mensagem);
    return json({ ok: false, error: mensagem }, 500);
  }
});
