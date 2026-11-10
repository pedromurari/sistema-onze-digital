/**
 * ped-avaliacao-aluno — formulário do aluno responder prova/trabalho.
 *
 * Fluxo: admin gera um link individual (ação `gerar_link`, autenticada),
 * o aluno abre o link público (`info` + `responder`, sem login — token
 * em `ped_acessos_avaliacao`, mesmo padrão de um-uso de outros links
 * públicos deste projeto). A resposta só é gravada crua em
 * `ped_entregas`/`ped_respostas` (status 'recebida') — sem nota nem
 * correção automática: quem aprova/corrige cada resposta é o pedagógico,
 * numa tela que ainda não existe (próximo passo, escopo separado).
 *
 * IMPORTANTE: construída mas NÃO liberar links reais pra aluno nenhum
 * ainda — aguardando ok explícito do Pedro (pedido em 10/11/2026).
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
function gerarToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
}

serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método inválido.' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 50_000) return reply({ erro: 'Requisição muito grande.' }, 413, origin);
  try {
    const body = await req.json();
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ erro: 'Serviço indisponível.' }, 503, origin);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Ação administrativa: gerar o link individual do aluno.
    if (body.acao === 'gerar_link') {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (!anonKey || !bearer) return reply({ erro: 'Acesso restrito.' }, 403, origin);
      const userDb = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });
      const { data: identity, error: authError } = await userDb.auth.getUser(bearer);
      if (authError || !identity.user) return reply({ erro: 'Acesso restrito.' }, 403, origin);
      const { data: podeEditar, error: permissionError } = await userDb.rpc('tem_permissao', { p_recurso: 'pedagogico', p_acao: 'editar' });
      if (permissionError || !podeEditar) return reply({ erro: 'Acesso restrito.' }, 403, origin);

      const avaliacaoId = body.avaliacao_id;
      const alunoId = body.aluno_id;
      if (typeof avaliacaoId !== 'string' || !UUID.test(avaliacaoId) || typeof alunoId !== 'string' || !UUID.test(alunoId))
        return reply({ erro: 'avaliacao_id e aluno_id são obrigatórios.' }, 400, origin);
      const { data: avaliacao, error: avaliacaoError } = await db.from('ped_avaliacoes').select('id').eq('id', avaliacaoId).maybeSingle();
      if (avaliacaoError) throw avaliacaoError;
      if (!avaliacao) return reply({ erro: 'Avaliação não encontrada.' }, 404, origin);
      const { data: aluno, error: alunoError } = await db.from('alunos').select('id,nome').eq('id', alunoId).maybeSingle();
      if (alunoError) throw alunoError;
      if (!aluno) return reply({ erro: 'Aluno não encontrado.' }, 404, origin);

      const token = gerarToken();
      const expiraEm = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: insertError } = await db.from('ped_acessos_avaliacao').insert({
        token_hash: await sha256(token), avaliacao_id: avaliacaoId, aluno_id: alunoId, expira_em: expiraEm,
      });
      if (insertError) throw insertError;
      return reply({ link: `https://sistema.idmpsi.com.br/prova/${avaliacaoId}?token=${token}`, aluno: aluno.nome }, 200, origin);
    }

    const avaliacaoId = body.avaliacao_id;
    const token = typeof body.token === 'string' ? body.token : '';
    if (typeof avaliacaoId !== 'string' || !UUID.test(avaliacaoId) || !/^[0-9a-f]{48}$/i.test(token))
      return reply({ erro: 'Link inválido.' }, 400, origin);

    const tokenHash = await sha256(token);
    const { data: acesso, error: acessoError } = await db.from('ped_acessos_avaliacao')
      .select('token_hash,avaliacao_id,aluno_id,expira_em,usado_em').eq('token_hash', tokenHash).eq('avaliacao_id', avaliacaoId).maybeSingle();
    if (acessoError) throw acessoError;
    if (!acesso) return reply({ erro: 'Link inválido ou expirado.' }, 404, origin);
    if (new Date(acesso.expira_em).getTime() < Date.now()) return reply({ erro: 'Este link expirou. Peça um novo à secretaria.' }, 410, origin);

    const [avaliacaoResp, alunoResp] = await Promise.all([
      db.from('ped_avaliacoes').select('titulo,tipo,modulo,instrucoes,status').eq('id', avaliacaoId).maybeSingle(),
      db.from('alunos').select('nome').eq('id', acesso.aluno_id).maybeSingle(),
    ]);
    if (avaliacaoResp.error || alunoResp.error) throw avaliacaoResp.error || alunoResp.error;
    if (!avaliacaoResp.data) return reply({ erro: 'Avaliação não encontrada.' }, 404, origin);
    if (avaliacaoResp.data.status !== 'publicada') return reply({ erro: 'Esta avaliação ainda não foi publicada.' }, 409, origin);

    if (body.acao === 'info') {
      const { data: questoes, error: questoesError } = await db.from('ped_questoes')
        .select('id,ordem,tipo,enunciado,opcoes,pontos').eq('avaliacao_id', avaliacaoId).order('ordem', { ascending: true });
      if (questoesError) throw questoesError;
      return reply({
        aluno: alunoResp.data?.nome || null, titulo: avaliacaoResp.data.titulo, tipo: avaliacaoResp.data.tipo,
        modulo: avaliacaoResp.data.modulo, instrucoes: avaliacaoResp.data.instrucoes,
        ja_enviada: Boolean(acesso.usado_em), questoes: questoes ?? [],
      }, 200, origin);
    }

    if (body.acao === 'responder') {
      if (acesso.usado_em) return reply({ erro: 'Esta prova já foi enviada. Não é possível enviar de novo.' }, 409, origin);
      const respostas = body.respostas;
      if (!respostas || typeof respostas !== 'object') return reply({ erro: 'Respostas inválidas.' }, 400, origin);

      const { data: questoes, error: questoesError } = await db.from('ped_questoes')
        .select('id,ordem,tipo').eq('avaliacao_id', avaliacaoId).order('ordem', { ascending: true });
      if (questoesError) throw questoesError;
      if (!questoes || questoes.length === 0) return reply({ erro: 'Avaliação sem questões.' }, 409, origin);

      // Grava a resposta crua, sem nota nem correção automática -- quem
      // aprova cada resposta é o pedagógico/diretoria, numa tela de revisão
      // que ainda não existe.
      const { data: entrega, error: entregaError } = await db.from('ped_entregas')
        .insert({ avaliacao_id: avaliacaoId, aluno_id: acesso.aluno_id, status: 'recebida' })
        .select('id').single();
      if (entregaError) throw entregaError;

      const linhas = questoes.map(questao => ({
        avaliacao_id: avaliacaoId, entrega_id: entrega.id, questao_id: questao.id,
        resposta_texto: typeof respostas[questao.id] === 'string' ? respostas[questao.id].trim() || null : null,
      }));
      const { error: respostasError } = await db.from('ped_respostas').insert(linhas);
      if (respostasError) throw respostasError;

      await db.from('ped_acessos_avaliacao').update({ usado_em: new Date().toISOString() }).eq('token_hash', tokenHash);

      return reply({ ok: true, entrega_id: entrega.id }, 200, origin);
    }

    return reply({ erro: 'Ação inválida.' }, 400, origin);
  } catch (error) {
    console.error('ped-avaliacao-aluno:', error instanceof Error ? error.message : 'erro inesperado');
    return reply({ erro: 'Não foi possível concluir. Tente novamente.' }, 500, origin);
  }
});
