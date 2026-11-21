/**
 * formacao-pagamento-webhook
 *
 * Recebe a notificação do Mercado Pago dos pagamentos criados pela
 * `formacao-inscricao-criar` (conta institucional do IDM) e, quando o
 * pagamento é aprovado, **fecha a matrícula inteira**:
 *
 *   1. marca a inscrição como aprovada
 *   2. fecha o lead no Kanban da vendedora
 *   3. cria a ficha do aluno na turma do produto (com forma de pagamento)
 *   4. lança o pagamento no Financeiro, na categoria do produto
 *   5. libera o acesso na Área de Membros e dispara a confirmação por
 *      e-mail + WhatsApp (reaproveita `membros-liberar-acesso-aluno`)
 *
 * Por que tudo aqui e não na função da ficha: cartão e Pix passam os dois
 * por este webhook (a cobrança é criada com notification_url apontando pra
 * cá), então centralizar evita duplicar a matrícula em dois caminhos. No Pix
 * isso é obrigatório de qualquer jeito -- o QR é pago minutos depois que a
 * pessoa já saiu da tela.
 *
 * Idempotente: se a inscrição já estiver aprovada, ou o aluno já existir,
 * não refaz nada. O Mercado Pago reenvia a mesma notificação várias vezes.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok = () => new Response('ok', { headers: cors });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Cria a ficha do aluno + o lançamento no Financeiro e libera a Área de
 * Membros. Só roda com pagamento aprovado.
 */
async function matricular(db: Db, inscricao: Record<string, unknown>, oferta: Record<string, unknown>) {
  const whatsapp = String(inscricao.whatsapp ?? '');
  const email = String(inscricao.email ?? '');
  const produto = String(oferta.produto_crm ?? '');

  // Turma do produto. Sem turma cadastrada não dá pra matricular -- melhor
  // deixar a venda registrada e avisar no log do que inventar turma.
  const { data: turma } = await db
    .from('turmas')
    .select('id, nome')
    .eq('produto', produto)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!turma) {
    console.error(`formacao-pagamento-webhook: nenhuma turma cadastrada pro produto '${produto}'`);
    return { alunoId: null, erro: 'sem turma' };
  }

  // Idempotência: mesma pessoa (whatsapp) já matriculada nessa turma.
  const { data: alunoExistente } = await db
    .from('alunos')
    .select('id')
    .eq('turma_id', turma.id)
    .eq('whatsapp', whatsapp)
    .maybeSingle();

  let alunoId = alunoExistente?.id ?? null;

  if (!alunoId) {
    const metodo = String(inscricao.metodo ?? '');
    const { data: alunoNovo, error: alunoErro } = await db
      .from('alunos')
      .insert({
        nome: inscricao.nome,
        email,
        whatsapp,
        cpf: inscricao.cpf ?? null,
        turma_id: turma.id,
        produto,
        status: 'ativo',
        tipo_pagamento: 'mensalidade',
        forma_pagamento: metodo === 'pix' ? 'pix' : 'cartao',
        valor_mensalidade: inscricao.valor,
        total_mensalidades: 1,
        mensalidades_pagas: 1,
        data_matricula: new Date().toISOString().slice(0, 10),
        // 'origem_lead' tem CHECK no banco -- os valores válidos são
        // direto/lancamento/npa/aula_secreta/time_comercial/pnl_manual.
        // A venda nasce de um lead atribuído à vendedora, então é time_comercial.
        origem_lead: 'time_comercial',
        vendedor: oferta.vendedor_padrao ?? null,
        observacoes: metodo === 'cartao' && inscricao.parcelas
          ? `Compra única no cartão em ${inscricao.parcelas}x.`
          : 'Compra única no Pix.',
      })
      .select('id')
      .single();

    if (alunoErro) {
      console.error('formacao-pagamento-webhook: erro ao criar aluno', alunoErro);
      return { alunoId: null, erro: alunoErro.message };
    }
    alunoId = alunoNovo.id;
  }

  // Lançamento no Financeiro (aba do produto). Idempotente pelo mp_payment_id.
  const { data: pagamentoExistente } = await db
    .from('pagamentos')
    .select('id')
    .eq('mp_payment_id', String(inscricao.mp_payment_id ?? ''))
    .maybeSingle();

  if (!pagamentoExistente) {
    const hoje = new Date().toISOString().slice(0, 10);
    const { error: pagErro } = await db.from('pagamentos').insert({
      aluno_id: alunoId,
      turma_id: turma.id,
      produto,
      mes_referencia: hoje.slice(0, 8) + '01',
      data_vencimento: hoje,
      data_pagamento: hoje,
      valor: inscricao.valor,
      status: 'pago',
      numero_parcela: 1,
      forma_pagamento: inscricao.metodo === 'pix' ? 'pix' : 'cartao',
      conta_recebimento: 'mercado_pago',
      mp_payment_id: String(inscricao.mp_payment_id ?? ''),
      categoria_contabil: 'receita_curso',
      observacoes: `Venda pela página de vendas (${oferta.nome}).`,
    });
    if (pagErro) console.error('formacao-pagamento-webhook: erro ao lançar pagamento', pagErro);
  }

  // Área de Membros + confirmação por e-mail e WhatsApp.
  const membrosKey = Deno.env.get('MEMBROS_LIBERAR_KEY');
  if (!membrosKey) {
    console.error('formacao-pagamento-webhook: MEMBROS_LIBERAR_KEY ausente — acesso não liberado');
    return { alunoId, erro: 'sem MEMBROS_LIBERAR_KEY' };
  }

  try {
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/membros-liberar-acesso-aluno`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-key': membrosKey,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ alunoId, enviarEmail: true, enviarWhatsapp: true }),
    });
    const corpo = await resp.json().catch(() => ({}));
    if (!resp.ok) console.error('formacao-pagamento-webhook: falha ao liberar acesso', corpo);
    else console.log(`formacao-pagamento-webhook: acesso liberado pro aluno ${alunoId}`);
  } catch (e) {
    console.error('formacao-pagamento-webhook: erro ao chamar membros-liberar-acesso-aluno', e);
  }

  return { alunoId, erro: null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return ok();

  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') ?? url.searchParams.get('id');

    if (!paymentId) {
      const body = await req.json().catch(() => ({}));
      paymentId = body?.data?.id ? String(body.data.id) : (body?.id ? String(body.id) : null);
      const tipo = body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
      if (tipo && tipo !== 'payment') return ok();
    }
    if (!paymentId) return ok();

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) {
      console.error('formacao-pagamento-webhook: MP_ACCESS_TOKEN ausente');
      return ok();
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    if (!mpRes.ok) {
      console.error('formacao-pagamento-webhook: pagamento não encontrado', paymentId);
      return ok();
    }
    const mp = await mpRes.json();

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: inscricao } = await db
      .from('formacao_inscricoes')
      .select('id, lead_id, status, nome, email, whatsapp, cpf, valor, metodo, parcelas, mp_payment_id, oferta_id')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle();

    // Pagamento de outro fluxo (matrícula, workshop, Divã) também chega aqui
    // se alguém apontar o webhook errado -- ignorar em silêncio é o certo.
    if (!inscricao) return ok();

    const statusMap: Record<string, string> = {
      approved: 'aprovado',
      pending: 'pendente',
      in_process: 'pendente',
      rejected: 'recusado',
      cancelled: 'cancelado',
      refunded: 'cancelado',
      charged_back: 'cancelado',
    };
    const status = statusMap[mp.status] ?? 'pendente';

    if (status === inscricao.status && status !== 'aprovado') return ok();

    if (status !== inscricao.status) {
      await db.from('formacao_inscricoes')
        .update({ status, atualizado_em: new Date().toISOString() })
        .eq('id', inscricao.id);
    }

    if (status !== 'aprovado') {
      console.log(`formacao-pagamento-webhook: inscrição ${inscricao.id} → ${status}`);
      return ok();
    }

    if (inscricao.lead_id) {
      await db.from('leads')
        .update({
          status: 'fechado',
          matriculado_em: new Date().toISOString(),
          ultima_atividade: new Date().toISOString(),
        })
        .eq('id', inscricao.lead_id);
    }

    const { data: oferta } = await db
      .from('formacao_ofertas')
      .select('nome, produto_crm, vendedor_padrao')
      .eq('id', inscricao.oferta_id)
      .maybeSingle();

    if (!oferta?.produto_crm) {
      console.error('formacao-pagamento-webhook: oferta sem produto_crm — matrícula não criada');
      return ok();
    }

    const resultado = await matricular(db, inscricao, oferta);
    console.log(`formacao-pagamento-webhook: inscrição ${inscricao.id} aprovada, aluno ${resultado.alunoId ?? '—'}`);
    return ok();
  } catch (error) {
    console.error('formacao-pagamento-webhook:', error);
    return ok();
  }
});
