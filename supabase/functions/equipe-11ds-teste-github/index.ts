import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Teste isolado e descartavel: confirma que o token do GitHub guardado no Vault
// consegue ler e escrever no repo 11ds-conhecimento (vault do Obsidian) antes de
// plugar isso em qualquer pipeline de verdade.

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-cron-key' };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function lerConhecimento(token: string, repo: string, caminho: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'equipe-11ds' },
  });
  if (!res.ok) throw new Error(`Falha ao ler ${caminho}: ${res.status} ${await res.text()}`);
  const data = await res.json() as { content: string; sha: string };
  const conteudo = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, '')), c => c.charCodeAt(0)));
  return { conteudo, sha: data.sha };
}

async function gravarConhecimento(token: string, repo: string, caminho: string, conteudoNovo: string, mensagemCommit: string, shaExistente?: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'equipe-11ds', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagemCommit,
      content: bytesToBase64(new TextEncoder().encode(conteudoNovo)),
      ...(shaExistente ? { sha: shaExistente } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Falha ao gravar ${caminho}: ${res.status} ${await res.text()}`);
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
  const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
  if (!cronSecret || cronKeyHeader !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { data: config } = await supabase.rpc('get_equipe_11ds_github_config');
    const token = config?.[0]?.token as string | undefined;
    const repo = config?.[0]?.repo as string | undefined;
    if (!token || !repo) throw new Error('Config do GitHub nao encontrada no Vault');

    const leitura = await lerConhecimento(token, repo, 'Midia-Criativos/Principios/ganchos-que-convertem.md');

    const caminhoTeste = 'Midia-Criativos/_teste-conexao.md';
    const escrita = await gravarConhecimento(token, repo, caminhoTeste, `Teste de conexao em ${new Date().toISOString()}\n`, 'test: verifica escrita no vault');

    return new Response(JSON.stringify({
      ok: true,
      leitura_primeiros_100_chars: leitura.conteudo.slice(0, 100),
      escrita_commit_sha: escrita.commit?.sha,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
