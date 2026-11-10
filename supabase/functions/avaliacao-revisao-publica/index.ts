import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORIGINS = new Set(['https://sistema.idmpsi.com.br', 'http://localhost:5173']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
// Exige nome e sobrenome -- a pessoa pode digitar errado (apelido, sobrenome
// trocado etc.), não tentamos casar com nenhum cadastro aqui, só recusamos
// um nome único (sem espaço) pra dar pra rastrear depois quem comentou o quê.
function nomeCompletoValido(nome: string) {
  return nome.trim().split(/\s+/).filter(Boolean).length >= 2;
}

serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método inválido.' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 20_000) return reply({ erro: 'Requisição muito grande.' }, 413, origin);
  try {
    const body = await req.json();
    const avaliacaoId = body?.avaliacao_id;
    if (typeof avaliacaoId !== 'string' || !UUID.test(avaliacaoId)) return reply({ erro: 'Link inválido.' }, 400, origin);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ erro: 'Serviço indisponível.' }, 503, origin);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: avaliacao, error: avaliacaoError } = await db.from('ped_avaliacoes')
      .select('id,titulo,tipo,modulo,instrucoes,status,revisao_publica')
      .eq('id', avaliacaoId).maybeSingle();
    if (avaliacaoError) throw avaliacaoError;
    if (!avaliacao || !avaliacao.revisao_publica) return reply({ erro: 'Link de revisão não encontrado ou desativado.' }, 404, origin);

    if (body.acao === 'info') {
      const { data: questoes, error: questoesError } = await db.from('ped_questoes')
        .select('id,ordem,tipo,enunciado,opcoes,resposta_correta,resposta_esperada,criterios_correcao,pontos')
        .eq('avaliacao_id', avaliacaoId).order('ordem', { ascending: true });
      if (questoesError) throw questoesError;
      return reply({
        titulo: avaliacao.titulo, tipo: avaliacao.tipo, modulo: avaliacao.modulo,
        instrucoes: avaliacao.instrucoes, status: avaliacao.status, questoes: questoes ?? [],
      }, 200, origin);
    }

    if (body.acao === 'comentar') {
      const autorNome = typeof body.autor_nome === 'string' ? body.autor_nome.trim().replace(/\s+/g, ' ') : '';
      const comentario = typeof body.comentario === 'string' ? body.comentario.trim() : '';
      const questaoId = typeof body.questao_id === 'string' && UUID.test(body.questao_id) ? body.questao_id : null;
      if (!nomeCompletoValido(autorNome) || autorNome.length > 160)
        return reply({ erro: 'Digite seu nome completo (nome e sobrenome).' }, 400, origin);
      if (comentario.length < 2 || comentario.length > 4000)
        return reply({ erro: 'Escreva o comentário antes de enviar.' }, 400, origin);
      if (questaoId) {
        const { data: questao, error: questaoCheckError } = await db.from('ped_questoes')
          .select('id').eq('id', questaoId).eq('avaliacao_id', avaliacaoId).maybeSingle();
        if (questaoCheckError) throw questaoCheckError;
        if (!questao) return reply({ erro: 'Questão não encontrada.' }, 404, origin);
      }
      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';
      const { data: allowed, error: rateError } = await db.rpc('ped_registrar_tentativa', {
        p_chave_hash: await sha256(`avaliacao-revisao:${avaliacaoId}:${ip}`), p_limite: 40,
      });
      if (rateError) throw rateError;
      if (!allowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);

      const { error: insertError } = await db.from('ped_revisoes').insert({
        avaliacao_id: avaliacaoId, questao_id: questaoId, autor_nome: autorNome, comentario, status: 'pendente',
      });
      if (insertError) throw insertError;
      return reply({ ok: true }, 200, origin);
    }

    return reply({ erro: 'Ação inválida.' }, 400, origin);
  } catch (error) {
    console.error('avaliacao-revisao-publica:', error instanceof Error ? error.message : 'erro inesperado');
    return reply({ erro: 'Não foi possível concluir. Tente novamente.' }, 500, origin);
  }
});
