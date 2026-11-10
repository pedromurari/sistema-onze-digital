/**
 * ped-avaliacao-aluno — formulário do aluno responder prova/trabalho.
 *
 * Link único por avaliação (ex: o professor manda no grupo da turma),
 * sem token individual -- quem identifica o aluno é CPF + data de
 * nascimento, igual ao esquema já usado em presenca-publica. Nome digitado
 * errado não trava nada: a ficha (CPF) é que manda, o nome salvo é sempre
 * o do cadastro, não o que a pessoa digitou.
 *
 * A resposta só é gravada crua em `ped_entregas`/`ped_respostas` (status
 * 'recebida') -- sem nota nem correção automática: quem aprova/corrige
 * cada resposta é o pedagógico, numa tela que ainda não existe (próximo
 * passo, escopo separado).
 */
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

type AlunoCandidato = { id: string; nome: string; status: string; turma_id: string; data_nascimento: string; turma_base: string };

serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método inválido.' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 50_000) return reply({ erro: 'Requisição muito grande.' }, 413, origin);
  try {
    const body = await req.json();
    const avaliacaoId = body?.avaliacao_id;
    if (typeof avaliacaoId !== 'string' || !UUID.test(avaliacaoId)) return reply({ erro: 'Link inválido.' }, 400, origin);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ erro: 'Serviço indisponível.' }, 503, origin);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: avaliacao, error: avaliacaoError } = await db.from('ped_avaliacoes')
      .select('id,titulo,tipo,modulo,instrucoes,status,turma_id').eq('id', avaliacaoId).maybeSingle();
    if (avaliacaoError) throw avaliacaoError;
    if (!avaliacao) return reply({ erro: 'Avaliação não encontrada.' }, 404, origin);
    if (avaliacao.status === 'encerrada') return reply({ erro: 'Esta avaliação foi encerrada.' }, 409, origin);

    if (body.acao === 'info') {
      const { data: questoes, error: questoesError } = await db.from('ped_questoes')
        .select('id,ordem,tipo,enunciado,opcoes,pontos').eq('avaliacao_id', avaliacaoId).order('ordem', { ascending: true });
      if (questoesError) throw questoesError;
      return reply({
        titulo: avaliacao.titulo, tipo: avaliacao.tipo, modulo: avaliacao.modulo,
        instrucoes: avaliacao.instrucoes, questoes: questoes ?? [],
      }, 200, origin);
    }

    if (body.acao === 'responder') {
      const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
      const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';
      const nascimento = typeof body.data_nascimento === 'string' ? body.data_nascimento : '';
      const respostas = body.respostas;
      if (nome.length < 3 || nome.length > 160 || cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento))
        return reply({ erro: 'Confira nome, CPF e data de nascimento.' }, 400, origin);
      if (!respostas || typeof respostas !== 'object') return reply({ erro: 'Respostas inválidas.' }, 400, origin);

      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';
      const { data: cpfAllowed, error: cpfRateError } = await db.rpc('ped_registrar_tentativa', {
        p_chave_hash: await sha256(`avaliacao-aluno-cpf:${avaliacaoId}:${cpf}`), p_limite: 8,
      });
      if (cpfRateError) throw cpfRateError;
      if (!cpfAllowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);
      const { data: ipAllowed, error: ipRateError } = await db.rpc('ped_registrar_tentativa', {
        p_chave_hash: await sha256(`avaliacao-aluno-ip:${avaliacaoId}:${ip}`), p_limite: 80,
      });
      if (ipRateError) throw ipRateError;
      if (!ipAllowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);

      const { data: candidatos, error: alunoError } = await db.rpc('ped_buscar_aluno_cpf', { p_cpf: cpf });
      if (alunoError) throw alunoError;

      let turmaBase: string | null = null;
      if (avaliacao.turma_id) {
        const { data: turma, error: turmaError } = await db.from('turmas').select('nome').eq('id', avaliacao.turma_id).maybeSingle();
        if (turmaError) throw turmaError;
        turmaBase = (turma?.nome || '').split('/')[0].trim();
      }

      // O nome digitado não precisa bater -- a ficha (CPF + nascimento, com
      // 1 dia de tolerância por causa de cadastros antigos com fuso errado)
      // é que identifica o aluno de verdade. Se houver mais de um CPF igual
      // matriculado em turmas diferentes, prioriza a turma desta avaliação.
      const nascimentoProximo = (a: AlunoCandidato) => Math.abs(
        (new Date(`${a.data_nascimento}T00:00:00Z`).getTime() - new Date(`${nascimento}T00:00:00Z`).getTime()) / 86400000,
      ) <= 1;
      const pool = (candidatos as AlunoCandidato[] | null)?.filter(nascimentoProximo) ?? [];
      const aluno = turmaBase ? pool.find(a => a.turma_base === turmaBase) ?? (pool.length === 1 ? pool[0] : null)
        : (pool.length === 1 ? pool[0] : null);

      if (!aluno || aluno.status !== 'ativo' || (turmaBase && aluno.turma_base !== turmaBase))
        return reply({ erro: 'Não foi possível confirmar seu cadastro. Confira o CPF e a data de nascimento ou fale com a secretaria.' }, 403, origin);

      const { data: entregaExistente, error: entregaCheckError } = await db.from('ped_entregas')
        .select('id').eq('avaliacao_id', avaliacaoId).eq('aluno_id', aluno.id).maybeSingle();
      if (entregaCheckError) throw entregaCheckError;
      if (entregaExistente) return reply({ erro: 'Você já enviou esta prova. Não é possível enviar de novo.' }, 409, origin);

      const { data: questoes, error: questoesError } = await db.from('ped_questoes')
        .select('id').eq('avaliacao_id', avaliacaoId);
      if (questoesError) throw questoesError;
      if (!questoes || questoes.length === 0) return reply({ erro: 'Avaliação sem questões.' }, 409, origin);

      const { data: entrega, error: entregaError } = await db.from('ped_entregas')
        .insert({ avaliacao_id: avaliacaoId, aluno_id: aluno.id, status: 'recebida' })
        .select('id').single();
      if (entregaError) throw entregaError;

      const linhas = questoes.map(questao => ({
        avaliacao_id: avaliacaoId, entrega_id: entrega.id, questao_id: questao.id,
        resposta_texto: typeof respostas[questao.id] === 'string' ? respostas[questao.id].trim() || null : null,
      }));
      const { error: respostasError } = await db.from('ped_respostas').insert(linhas);
      if (respostasError) throw respostasError;

      return reply({ ok: true, entrega_id: entrega.id }, 200, origin);
    }

    return reply({ erro: 'Ação inválida.' }, 400, origin);
  } catch (error) {
    console.error('ped-avaliacao-aluno:', error instanceof Error ? error.message : 'erro inesperado');
    return reply({ erro: 'Não foi possível concluir. Tente novamente.' }, 500, origin);
  }
});
