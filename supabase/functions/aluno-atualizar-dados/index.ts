import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORIGINS = new Set(['https://sistema.idmpsi.com.br', 'http://localhost:5173']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{24}$/i;
const TOKEN_LEN = 24;
const encoder = new TextEncoder();

function headers(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://sistema.idmpsi.com.br',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}
function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function alunoToken(alunoId: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`atualizar-dados:${alunoId}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('').slice(0, TOKEN_LEN);
}
function sameToken(a: string, b: string) {
  if (!HEX.test(a) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método inválido.' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 10_000) return reply({ erro: 'Requisição muito grande.' }, 413, origin);
  try {
    const body = await req.json();
    const alunoId = body?.aluno_id;
    const chave = typeof body?.chave === 'string' ? body.chave : '';
    if (typeof alunoId !== 'string' || !UUID.test(alunoId)) return reply({ erro: 'Link inválido.' }, 400, origin);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ erro: 'Serviço indisponível.' }, 503, origin);
    if (!sameToken(chave, await alunoToken(alunoId, serviceKey))) return reply({ erro: 'Link inválido.' }, 403, origin);

    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: aluno, error: alunoError } = await db.from('alunos')
      .select('id,nome,cpf,data_nascimento,status').eq('id', alunoId).maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno || aluno.status !== 'ativo') return reply({ erro: 'Cadastro não encontrado.' }, 404, origin);

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';
    const { data: allowed, error: rateError } = await db.rpc('ped_registrar_tentativa', {
      p_chave_hash: await sha256(`atualizar-dados:${alunoId}:${ip}`), p_limite: 20,
    });
    if (rateError) throw rateError;
    if (!allowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);

    if (body.acao === 'info') {
      return reply({
        nome: aluno.nome,
        cpf_cadastrado: !!aluno.cpf,
        nascimento_cadastrado: !!aluno.data_nascimento,
      }, 200, origin);
    }

    if (body.acao === 'salvar') {
      // So valida e preenche o que ainda esta vazio -- nunca sobrescreve um dado
      // ja cadastrado por esse link publico (evita que alguem com o link altere
      // um cadastro valido).
      const patch: Record<string, string> = {};
      if (!aluno.cpf) {
        const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';
        if (cpf.length !== 11) return reply({ erro: 'Confira o CPF.' }, 400, origin);
        patch.cpf = cpf;
      }
      if (!aluno.data_nascimento) {
        const nascimento = typeof body.data_nascimento === 'string' ? body.data_nascimento : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return reply({ erro: 'Confira a data de nascimento.' }, 400, origin);
        patch.data_nascimento = nascimento;
      }
      if (Object.keys(patch).length === 0) return reply({ mensagem: 'Cadastro já estava completo.' }, 200, origin);
      const { error: updateError } = await db.from('alunos').update(patch).eq('id', alunoId);
      if (updateError) throw updateError;
      return reply({ mensagem: 'Dados atualizados com sucesso.' }, 200, origin);
    }

    return reply({ erro: 'Ação inválida.' }, 400, origin);
  } catch (error) {
    console.error('aluno-atualizar-dados:', error instanceof Error ? error.message : 'erro inesperado');
    return reply({ erro: 'Não foi possível concluir. Tente novamente.' }, 500, origin);
  }
});
