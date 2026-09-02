/**
 * time-comercial-atribuir-turma
 * Atribui turma + gera/recalcula as parcelas de um aluno reivindicado por um
 * vendedor do Time Comercial (aba Operação, "Alunos aguardando turma") --
 * mesma lógica de src/lib/parcelasAluno.ts (buildInstallments/
 * sincronizarParcelasAluno/assignTurmaEAtualizarParcelas), portada pra cá.
 *
 * Por quê: essa ação grava em `pagamentos`, e a RLS dessa tabela exige
 * permissão de recurso "financeiro" (ver+editar) -- que vendedores não têm
 * (e não devem ter, dar isso liberaria a tela inteira de Financeiro pra
 * eles). Rodando aqui com service role, o vendedor não precisa da permissão
 * de financeiro pra essa ação pontual -- a autorização é feita nesta
 * function, checando que o aluno é mesmo dele (ou que quem chamou é
 * gestor/admin). Achado real 2026-08-27 ao revisar RLS antes de liberar o
 * sistema pra Helen/Miguel de verdade.
 *
 * IMPORTANTE: manter esta lógica sincronizada com src/lib/parcelasAluno.ts
 * se as regras de negócio mudarem (Financeiro.tsx continua usando a versão
 * client-side, que roda como admin e não tem esse problema de RLS).
 *
 * Body: { alunoId: string, turmaId: string }
 * Auth: Authorization: Bearer <jwt do usuário logado> (verify_jwt=true --
 * o Supabase já garante que é um usuário autenticado antes de chamar aqui).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type PaymentMethod = 'boleto' | 'cartao' | 'avista';

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDateOnly = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

const dateWithClampedDay = (year: number, month: number, day: number) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 12, 0, 0);
};

function normalizePaymentMethod(value?: string | null): PaymentMethod {
  const normalized = (value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (normalized === 'cartao') return 'cartao';
  if (normalized === 'pix' || normalized === 'avista' || normalized === 'a_vista' || normalized === 'a vista') return 'avista';
  return 'boleto';
}

function paymentMethodTotal(method?: string | null): number {
  const normalized = normalizePaymentMethod(method);
  if (normalized === 'cartao') return 1;
  if (normalized === 'avista') return 1;
  return 15;
}

function extractDueDay(value?: string | number | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 10;
}

function buildInstallments({
  alunoId, turmaId, produto, valor, method, diaVencimento, dataMatricula, dataSegundaParcela,
  existingPaidNumbers = new Set<number>(), minTotal, isIsento = false,
}: {
  alunoId: string; turmaId: string; produto: string; valor: number; method: PaymentMethod;
  diaVencimento: number; dataMatricula?: string | null; dataSegundaParcela?: Date | null;
  existingPaidNumbers?: Set<number>; minTotal?: number; isIsento?: boolean;
}) {
  const matricula = parseDateOnly(dataMatricula) || new Date();
  const targetTotal = (minTotal != null && minTotal > 0) ? minTotal : paymentMethodTotal(method);
  const matriculaDate = formatLocalDate(matricula);

  return Array.from({ length: targetTotal }, (_, index) => {
    const numeroParcela = index + 1;
    if (existingPaidNumbers.has(numeroParcela)) return null;

    let dueDate: Date;
    if (index === 0) {
      dueDate = matricula;
    } else if (dataSegundaParcela) {
      dueDate = dateWithClampedDay(
        dataSegundaParcela.getFullYear(), dataSegundaParcela.getMonth() + (index - 1), dataSegundaParcela.getDate(),
      );
    } else {
      dueDate = dateWithClampedDay(matricula.getFullYear(), matricula.getMonth() + index, diaVencimento);
    }
    const dueDateText = formatLocalDate(dueDate);
    const mesReferencia = formatLocalDate(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1, 12, 0, 0));
    const paidByPlan = method === 'cartao' || method === 'avista' || (method === 'boleto' && index === 0);

    return {
      aluno_id: alunoId, turma_id: turmaId, produto,
      valor: isIsento ? 0 : valor,
      mes_referencia: mesReferencia, data_vencimento: dueDateText, numero_parcela: numeroParcela,
      status: isIsento ? 'isento' : (paidByPlan ? 'pago' : 'pendente'),
      data_pagamento: isIsento ? null : (paidByPlan ? matriculaDate : null),
      observacoes: index === 0 ? 'Ato de matricula' : null,
    };
  }).filter(Boolean) as Record<string, unknown>[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData?.user) {
      return json({ ok: false, erro: 'Não autenticado.' }, 401);
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: perfil } = await db.from('profiles').select('nome').eq('id', authData.user.id).maybeSingle();
    const { data: papel } = await db.from('user_roles').select('role').eq('user_id', authData.user.id).maybeSingle();
    const ehGestorOuAdmin = papel?.role === 'admin' || papel?.role === 'gestor';

    const body = await req.json();
    const alunoId = String(body?.alunoId ?? '');
    const turmaId = String(body?.turmaId ?? '');
    if (!alunoId || !turmaId) return json({ ok: false, erro: 'alunoId e turmaId são obrigatórios.' }, 400);

    const { data: aluno, error: alunoErr } = await db
      .from('alunos')
      .select('id, produto, forma_pagamento, dia_vencimento, dia_vencimento_contrato, tipo_pagamento, data_matricula, valor_mensalidade, total_mensalidades, vendedor_id')
      .eq('id', alunoId)
      .maybeSingle();

    if (alunoErr || !aluno) return json({ ok: false, erro: 'Aluno não encontrado.' }, 404);

    // Autorização: gestor/admin sempre pode; vendedor só pode atribuir turma
    // pro próprio aluno reivindicado (mesmo nome em alunos.vendedor_id).
    if (!ehGestorOuAdmin && aluno.vendedor_id !== perfil?.nome) {
      return json({ ok: false, erro: 'Esse aluno não é seu -- não é possível atribuir turma.' }, 403);
    }

    const { error: updTurmaErr } = await db.from('alunos').update({ turma_id: turmaId }).eq('id', alunoId);
    if (updTurmaErr) return json({ ok: false, erro: `Erro ao atualizar turma: ${updTurmaErr.message}` }, 500);

    const method = normalizePaymentMethod(aluno.forma_pagamento);
    const diaVenc = extractDueDay(aluno.dia_vencimento || aluno.dia_vencimento_contrato);
    const isIsento = aluno.tipo_pagamento === 'bolsa' || aluno.tipo_pagamento === 'cortesia';

    let valorEfetivo = Number(aluno.valor_mensalidade ?? NaN);
    if (aluno.valor_mensalidade == null) {
      const { data: turma } = await db.from('turmas').select('valor_mensalidade').eq('id', turmaId).maybeSingle();
      valorEfetivo = Number(turma?.valor_mensalidade ?? 109.90);
    }

    const { data: dbPagamentos } = await db
      .from('pagamentos')
      .select('id, aluno_id, turma_id, produto, valor, mes_referencia, data_vencimento, data_pagamento, numero_parcela, status, created_at')
      .eq('aluno_id', alunoId);
    const existentes = (dbPagamentos ?? []).sort((a: any, b: any) => (a.numero_parcela || 0) - (b.numero_parcela || 0));

    if (isIsento) {
      if (existentes.length > 0) {
        const { error: delErr } = await db.from('pagamentos').delete().in('id', existentes.map((p: any) => p.id));
        if (delErr) return json({ ok: false, erro: `Erro ao limpar parcelas: ${delErr.message}` }, 500);
      }
      const total = (aluno.total_mensalidades && aluno.total_mensalidades > 0) ? aluno.total_mensalidades : paymentMethodTotal(method);
      const rows = buildInstallments({
        alunoId, turmaId, produto: aluno.produto, valor: 0, method, diaVencimento: diaVenc,
        dataMatricula: aluno.data_matricula, minTotal: total, isIsento: true,
      });
      if (rows.length > 0) {
        const { error: insErr } = await db.from('pagamentos').insert(rows);
        if (insErr) return json({ ok: false, erro: `Erro ao gerar parcelas: ${insErr.message}` }, 500);
      }
      const { error: updAlunoErr } = await db.from('alunos').update({ mensalidades_pagas: 0, total_mensalidades: total }).eq('id', alunoId);
      if (updAlunoErr) return json({ ok: false, erro: updAlunoErr.message }, 500);
      return json({ ok: true });
    }

    const pagas = existentes.filter((p: any) => p.status === 'pago');
    const numerosPagos = new Set(pagas.map((p: any) => p.numero_parcela || 0).filter(Boolean));
    const maiorParcelaPaga = Math.max(0, ...Array.from(numerosPagos) as number[]);
    const baseTotal = (aluno.total_mensalidades && aluno.total_mensalidades > 0) ? aluno.total_mensalidades : paymentMethodTotal(method);
    const total = Math.max(baseTotal, maiorParcelaPaga, pagas.length);
    const abertas = existentes.filter((p: any) => p.status !== 'pago');

    if (abertas.length > 0) {
      const { error: delErr } = await db.from('pagamentos').delete().in('id', abertas.map((p: any) => p.id));
      if (delErr) return json({ ok: false, erro: `Erro ao limpar parcelas em aberto: ${delErr.message}` }, 500);
    }
    if (pagas.length > 0) {
      const { error: updPagasErr } = await db.from('pagamentos').update({ turma_id: turmaId, produto: aluno.produto }).eq('aluno_id', alunoId).eq('status', 'pago');
      if (updPagasErr) return json({ ok: false, erro: `Erro ao atualizar parcelas pagas: ${updPagasErr.message}` }, 500);
    }

    const rows = buildInstallments({
      alunoId, turmaId, produto: aluno.produto, valor: valorEfetivo, method, diaVencimento: diaVenc,
      dataMatricula: aluno.data_matricula, existingPaidNumbers: numerosPagos, minTotal: total,
    });
    if (rows.length > 0) {
      const { error: insErr } = await db.from('pagamentos').insert(rows);
      if (insErr) return json({ ok: false, erro: `Erro ao gerar parcelas: ${insErr.message}` }, 500);
    }

    const pagasNoPlano = rows.filter((r) => r.status === 'pago').length + pagas.length;
    const { error: updAlunoErr } = await db.from('alunos').update({ mensalidades_pagas: pagasNoPlano, total_mensalidades: total }).eq('id', alunoId);
    if (updAlunoErr) return json({ ok: false, erro: updAlunoErr.message }, 500);

    return json({ ok: true });
  } catch (error) {
    console.error('time-comercial-atribuir-turma error:', error);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
