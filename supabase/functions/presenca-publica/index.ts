import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ORIGINS = new Set(['https://sistema.idmpsi.com.br', 'http://localhost:5173']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{24}$/i;
const TOKEN_LEN = 24; // 96 bits -- curto o bastante pra caber num link clicavel no WhatsApp/iPhone, forte o bastante pra nao ser adivinhado
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
async function professorToken(aulaId: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`presenca-professor:${aulaId}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('').slice(0, TOKEN_LEN);
}
function sameToken(a: string, b: string) {
  if (!HEX.test(a) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}
function hojeBrasil() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

serve(async req => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: headers(origin) });
  if (req.method !== 'POST') return reply({ erro: 'Método inválido.' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 10_000) return reply({ erro: 'Requisição muito grande.' }, 413, origin);
  try {
    const body = await req.json();
    const aulaId = body?.aula_id;
    if (typeof aulaId !== 'string' || !UUID.test(aulaId)) return reply({ erro: 'Link inválido.' }, 400, origin);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return reply({ erro: 'Serviço indisponível.' }, 503, origin);
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: aula, error: aulaError } = await db.from('aulas')
      .select('id,turma_id,profissional_id,data,horario_inicio,horario_fim,modulo,status')
      .eq('id', aulaId).maybeSingle();
    if (aulaError) throw aulaError;
    if (!aula) return reply({ erro: 'Aula não encontrada.' }, 404, origin);

    if (body.acao === 'links') {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (!anonKey || !bearer) return reply({ erro: 'Acesso restrito.' }, 403, origin);
      const userDb = createClient(url, anonKey, {
        auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: identity, error: authError } = await userDb.auth.getUser(bearer);
      if (authError || !identity.user) return reply({ erro: 'Acesso restrito.' }, 403, origin);
      const { data: authorized, error: permissionError } = await userDb.from('aulas')
        .select('id').eq('id', aulaId).maybeSingle();
      if (permissionError || !authorized) return reply({ erro: 'Acesso restrito.' }, 403, origin);
      return reply({
        aluno: `https://sistema.idmpsi.com.br/presenca/${aulaId}`,
        professor: aula.profissional_id
          ? `https://sistema.idmpsi.com.br/presenca/${aulaId}?perfil=professor&chave=${await professorToken(aulaId, serviceKey)}`
          : null,
      }, 200, origin);
    }

    const [turmaResp, professorResp] = await Promise.all([
      db.from('turmas').select('nome').eq('id', aula.turma_id).maybeSingle(),
      aula.profissional_id ? db.from('profissionais').select('nome').eq('id', aula.profissional_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (turmaResp.error || professorResp.error) throw turmaResp.error || professorResp.error;
    const hoje = hojeBrasil();
    const diaSeguinte = new Date(`${aula.data}T12:00:00Z`);
    diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
    const janelaAberta = ['agendada', 'realizada'].includes(aula.status) &&
      hoje >= aula.data && hoje <= diaSeguinte.toISOString().slice(0, 10);
    if (body.acao === 'info') return reply({
      turma: (turmaResp.data?.nome || 'Turma').split('/')[0], professor: professorResp.data?.nome || null,
      data: aula.data, horario_inicio: aula.horario_inicio, horario_fim: aula.horario_fim,
      modulo: aula.modulo, status: aula.status, janela_aberta: janelaAberta,
    }, 200, origin);
    if (!janelaAberta) return reply({ erro: 'A presença desta aula não está aberta.' }, 409, origin);

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';
    const { data: allowed, error: rateError } = await db.rpc('ped_registrar_tentativa', {
      p_chave_hash: await sha256(`presenca:${aulaId}:${ip}`), p_limite: 30,
    });
    if (rateError) throw rateError;
    if (!allowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);

    let tipo: 'aluno' | 'professor';
    let pessoaId: string;
    if (body.acao === 'assinar_professor') {
      const chave = typeof body.chave === 'string' ? body.chave : '';
      if (!aula.profissional_id || !sameToken(chave, await professorToken(aulaId, serviceKey)))
        return reply({ erro: 'Link do professor inválido.' }, 403, origin);
      tipo = 'professor'; pessoaId = aula.profissional_id;
    } else if (body.acao === 'assinar_aluno') {
      const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
      const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';
      const nascimento = typeof body.data_nascimento === 'string' ? body.data_nascimento : '';
      if (nome.length < 3 || nome.length > 160 || cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento))
        return reply({ erro: 'Confira nome, CPF e data de nascimento.' }, 400, origin);
      const { data: cpfAllowed, error: cpfRateError } = await db.rpc('ped_registrar_tentativa', {
        p_chave_hash: await sha256(`presenca-cpf:${aulaId}:${cpf}`), p_limite: 5,
      });
      if (cpfRateError) throw cpfRateError;
      if (!cpfAllowed) return reply({ erro: 'Muitas tentativas. Tente novamente mais tarde.' }, 429, origin);
      const { data: alunos, error: alunoError } = await db.rpc('ped_buscar_aluno_cpf', { p_cpf: cpf });
      if (alunoError) throw alunoError;
      const aluno = alunos?.length === 1 ? alunos[0] : null;
      if (!aluno || aluno.status !== 'ativo' || aluno.turma_id !== aula.turma_id ||
        aluno.data_nascimento !== nascimento || normalize(aluno.nome) !== normalize(nome))
        return reply({ erro: 'Não foi possível confirmar sua matrícula nesta turma. Confira os dados ou fale com a secretaria.' }, 403, origin);
      tipo = 'aluno'; pessoaId = aluno.id;
    } else return reply({ erro: 'Ação inválida.' }, 400, origin);

    const { data: presencaId, error: saveError } = await db.rpc('registrar_presenca_portal', {
      p_aula_id: aulaId, p_tipo: tipo, p_pessoa_id: pessoaId,
    });
    if (saveError) {
      if (/AULA_INDISPONIVEL|FORA_DA_JANELA/.test(saveError.message))
        return reply({ erro: 'A presença desta aula não está aberta.' }, 409, origin);
      if (/ALUNO_INVALIDO|PROFESSOR_INVALIDO|TIPO_INVALIDO/.test(saveError.message))
        return reply({ erro: 'Não foi possível confirmar a presença.' }, 403, origin);
      throw saveError;
    }
    return reply({ presenca_id: presencaId, mensagem: 'Presença confirmada.' }, 200, origin);
  } catch (error) {
    console.error('presenca-publica:', error instanceof Error ? error.message : 'erro inesperado');
    return reply({ erro: 'Não foi possível concluir. Tente novamente.' }, 500, origin);
  }
});
