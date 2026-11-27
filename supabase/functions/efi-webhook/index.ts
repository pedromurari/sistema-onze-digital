/**
 * efi-webhook -- recebe a notificacao da Efi e da baixa na parcela (26/11/2026).
 *
 * COMO A EFI NOTIFICA: ela faz um POST na notification_url contendo APENAS
 * um token. Nenhum dado de pagamento, nenhuma assinatura, nenhum mTLS. O
 * payload nao prova nada e NAO e usado como fato: ele so diz "mudou alguma
 * coisa, vem conferir". A verdade vem de GET /v1/notification/{token},
 * autenticado com as nossas credenciais.
 *
 * Isso nao e paranoia -- e a licao do incidente syncpay-webhook
 * (19-22/11/2026), em que 10 vendas forjadas entraram porque o sistema
 * acreditou no corpo do POST. Aqui nao existe caminho que de baixa sem ter
 * passado pela consulta autenticada.
 *
 * AMBIENTE: a URL carrega ?amb=homolog ou ?amb=producao. Nao e inferido:
 * notificacao de homologacao consultada com credencial de producao (ou
 * vice-versa) devolveria dado de outra cobranca.
 *
 * CLOUDFLARE: a Efi fica atras de Cloudflare, que devolve 403 "error code:
 * 1010" pra User-Agent de cliente HTTP padrao. Todo fetch manda UA explicito.
 *
 * LIGACAO COM A PARCELA: `metadata.custom_id` da cobranca carrega o
 * pagamentos.id. E por ele que a baixa encontra a parcela -- nunca por
 * valor, que colidiria entre alunos com a mesma mensalidade.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UA = 'IDM-CRM/1.0';
const HOSTS = {
  homolog: 'https://cobrancas-h.api.efipay.com.br',
  producao: 'https://cobrancas.api.efipay.com.br',
};

const PRODUTO_LABEL: Record<string, string> = {
  psicanalise: 'Formação em Psicanálise',
  numerologia: 'Mentoria NPS',
  pnl: 'Formação em PNL',
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const ok = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

function credenciais(amb: 'homolog' | 'producao') {
  return amb === 'homolog'
    ? { id: Deno.env.get('EFI_CLIENT_ID_HOMOLOG'), secret: Deno.env.get('EFI_CLIENT_SECRET_HOMOLOG') }
    : { id: Deno.env.get('EFI_CLIENT_ID'), secret: Deno.env.get('EFI_CLIENT_SECRET') };
}

async function token(amb: 'homolog' | 'producao'): Promise<string> {
  const { id, secret } = credenciais(amb);
  if (!id || !secret) throw new Error(`credenciais Efi ausentes para ${amb}`);
  const r = await fetch(`${HOSTS[amb]}/v1/authorize`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(20_000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`authorize ${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt).access_token;
}

/**
 * Extrai o token do POST. A Efi documenta o acesso via $_POST['notification'],
 * ou seja form-urlencoded -- mas aceitamos JSON tambem porque a doc nao e
 * explicita sobre o formato e nao quero depender disso.
 */
async function lerToken(req: Request): Promise<{ token: string | null; bruto: string }> {
  const bruto = await req.text();
  if (!bruto) return { token: null, bruto: '' };
  try {
    const j = JSON.parse(bruto);
    const t = j?.notification ?? j?.token ?? null;
    if (t) return { token: String(t), bruto };
  } catch { /* nao era JSON, tenta form */ }
  const p = new URLSearchParams(bruto);
  return { token: p.get('notification') ?? p.get('token'), bruto };
}

/**
 * Contrato da matricula (Autentique). So faz sentido na parcela 1.
 *
 * Idempotente de verdade: le `alunos` antes de cada tentativa e sai se o
 * documento ja existe -- notificacao repetida da Efi (ela manda duas vezes,
 * ~350ms de diferenca) nao pode gerar dois contratos pro mesmo aluno.
 *
 * Falha aqui NUNCA derruba a baixa: o dinheiro entrou, a parcela e paga, e
 * contrato pendente e problema reparavel. O inverso nao e.
 */
async function garantirContrato(
  sb: ReturnType<typeof createClient>,
  alunoId: string,
): Promise<void> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const { data: aluno } = await sb
      .from('alunos')
      .select('id, cpf, data_nascimento, endereco, cep, cidade_estado, autentique_documento_id, autentique_link_assinatura')
      .eq('id', alunoId)
      .maybeSingle();

    if (!aluno) return;
    if (aluno.autentique_documento_id && aluno.autentique_link_assinatura) return;

    if (!aluno.cpf || !aluno.data_nascimento || !aluno.endereco || !aluno.cidade_estado) {
      console.error('efi-webhook: dados insuficientes pra gerar contrato', alunoId);
      return; // repetir nao resolve: falta cadastro, nao e falha transitoria
    }

    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/autentique-criar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({
          aluno_id: aluno.id,
          cpf: aluno.cpf,
          data_nascimento: aluno.data_nascimento,
          endereco: aluno.endereco,
          cep: aluno.cep,
          cidade_estado: aluno.cidade_estado,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok && res?.link_assinatura) return;
      console.error('efi-webhook: Autentique sem link', r.status, JSON.stringify(res).slice(0, 300));
    } catch (e) {
      console.error('efi-webhook: erro ao chamar autentique-criar', e);
    }
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 700));
  }
  console.error('efi-webhook: contrato continua pendente apos 3 tentativas', alunoId);
}

/** Confirmacao pro aluno. Mesmo texto e mesmo numero das outras baixas. */
async function confirmarPagamento(
  sb: ReturnType<typeof createClient>,
  parcela: { id: string; aluno_id: string; numero_parcela: number; valor: number | string; produto: string | null },
) {
  const { data: aluno } = await sb
    .from('alunos')
    .select('id, nome, whatsapp, cobranca_telefone, total_mensalidades')
    .eq('id', parcela.aluno_id)
    .maybeSingle();

  const numero = String((aluno?.cobranca_telefone || aluno?.whatsapp || '')).trim();
  if (!aluno || !numero) return;

  const primeiroNome = String(aluno.nome ?? '').trim().split(/\s+/)[0] ?? '';
  const vocativo = primeiroNome ? `, ${primeiroNome}` : '';
  const label = PRODUTO_LABEL[String(parcela.produto ?? '')] ?? 'seu curso';
  const valorFmt = Number(parcela.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const total = aluno.total_mensalidades ? ` de ${aluno.total_mensalidades}` : '';

  const mensagem =
    `✅ Pagamento confirmado${vocativo}!\n\n` +
    `Recebemos a parcela ${parcela.numero_parcela}${total} do *${label}*, no valor de *R$ ${valorFmt}*. ` +
    `Está tudo certo por aqui 💙\n\nQualquer dúvida, é só chamar. Financeiro IDM.`;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'x-financeiro-key': Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026',
    },
    body: JSON.stringify({ numero, mensagem, instance_name: 'Financeiro IDM', typing_delay_ms: 2000 }),
  }).catch(() => null);

  await sb.from('cobranca_logs').insert({
    aluno_id: aluno.id,
    pagamento_id: parcela.id,
    aluno_nome: String(aluno.nome ?? ''),
    telefone: numero,
    mensagem,
    template_nome: 'Confirmação de pagamento (Efí)',
    template_tipo: 'quitacao',
    status: r?.ok ? 'enviado' : 'erro',
    enviado_em: r?.ok ? new Date().toISOString() : null,
    manual: false,
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const url = new URL(req.url);
  const amb = url.searchParams.get('amb') === 'producao' ? 'producao' : 'homolog';

  const log: Record<string, unknown> = {};
  // try/catch de verdade, e NAO `.catch()` no builder: o retorno do
  // supabase-js e um thenable, nao uma Promise -- `.catch` nele estoura
  // TypeError e derruba a funcao antes de qualquer resposta. Foi o que
  // aconteceu na primeira notificacao real da Efi (26/11/2026): 500 seco,
  // sem log, justamente porque o log era o que quebrava.
  const gravar = async (extra: Record<string, unknown>) => {
    try {
      const { error } = await sb.from('efi_webhook_logs').insert({ ...log, ...extra });
      if (error) console.error('efi-webhook: falha ao gravar log:', error.message);
    } catch (e) {
      console.error('efi-webhook: excecao ao gravar log:', e);
    }
  };

  try {
    const { token: notifToken, bruto } = await lerToken(req);
    log.token = notifToken;
    log.corpo_bruto = bruto.slice(0, 4000);

    if (!notifToken) {
      await gravar({ acao: 'ignorado', detalhe: 'POST sem token de notificacao' });
      return ok({ recebido: true, acao: 'ignorado' });
    }

    // --- A consulta. Unica fonte de verdade deste arquivo. ---
    const t = await token(amb);
    const r = await fetch(`${HOSTS[amb]}/v1/notification/${encodeURIComponent(notifToken)}`, {
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(25_000),
    });
    const txt = await r.text();
    let corpo: any = null;
    try { corpo = JSON.parse(txt); } catch { corpo = { nao_json: txt.slice(0, 600) }; }

    log.consulta_status = r.status;
    log.consulta_resposta = corpo;

    if (!r.ok) {
      await gravar({ acao: 'erro', detalhe: `consulta ${r.status}` });
      // 500: erro nosso/da Efi merece reenvio, nao silencio.
      return new Response(JSON.stringify({ erro: 'consulta falhou' }), { status: 500, headers: cors });
    }

    // A resposta e um historico. O evento que vale e o mais recente.
    const itens: any[] = Array.isArray(corpo?.data) ? corpo.data : [];
    const ultimo = itens.length ? itens[itens.length - 1] : null;
    if (!ultimo) {
      await gravar({ acao: 'ignorado', detalhe: 'consulta sem itens' });
      return ok({ recebido: true, acao: 'ignorado' });
    }

    const status = String(ultimo?.status?.current ?? ultimo?.status ?? '').toLowerCase();
    const customId = ultimo?.custom_id ? String(ultimo.custom_id) : null;
    const chargeId = ultimo?.identifiers?.charge_id ?? ultimo?.charge_id ?? null;

    log.status_efi = status;
    log.custom_id = customId;
    log.charge_id = chargeId;

    // A Efi usa DOIS status pra "entrou dinheiro":
    //   paid    -- o cliente pagou o boleto no banco;
    //   settled -- alguem deu baixa manual (no painel ou via API /settle).
    // Os dois valem baixa, mas sao coisas diferentes e o log distingue:
    // `settled` em producao significa que um humano marcou como pago, e
    // vale saber quando foi isso.
    const PAGOS = new Set(['paid', 'settled']);
    if (!PAGOS.has(status)) {
      await gravar({ acao: 'ignorado', detalhe: `status ${status} nao exige baixa` });
      return ok({ recebido: true, status, acao: 'ignorado' });
    }

    if (!customId) {
      await gravar({ acao: 'erro', detalhe: 'pago, mas sem custom_id -- nao da pra achar a parcela' });
      return ok({ recebido: true, acao: 'erro' });
    }

    const { data: parcela } = await sb
      .from('pagamentos')
      .select('id, aluno_id, numero_parcela, valor, status, produto')
      .eq('id', customId)
      .maybeSingle();

    if (!parcela) {
      await gravar({ acao: 'erro', detalhe: `custom_id ${customId} nao bate com nenhuma parcela` });
      return ok({ recebido: true, acao: 'erro' });
    }

    // Idempotente: notificacao repetida (a Efi reenvia) nao re-baixa nem
    // manda a confirmacao duas vezes.
    if (parcela.status === 'pago') {
      await gravar({ pagamento_id: parcela.id, acao: 'ignorado', detalhe: 'parcela ja estava paga' });
      return ok({ recebido: true, acao: 'ja_pago' });
    }

    const hojeBr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { error: upErr } = await sb
      .from('pagamentos')
      .update({ status: 'pago', data_pagamento: hojeBr, conta_recebimento: 'efi' })
      .eq('id', parcela.id);

    if (upErr) {
      await gravar({ pagamento_id: parcela.id, acao: 'erro', detalhe: `baixa falhou: ${upErr.message}` });
      return new Response(JSON.stringify({ erro: upErr.message }), { status: 500, headers: cors });
    }

    await confirmarPagamento(sb, parcela as any).catch((e) =>
      console.error('efi-webhook: falha na confirmacao', parcela.id, e));

    // Parcela 1 paga = matricula efetivada, e e dai que nasce o contrato.
    // Isso existia so no caminho do Asaas (asaas-webhook-time-comercial e
    // o polling do matricula-pagamento-criar). Quando o boleto de matricula
    // passou pra Efi em 27/11/2026, a baixa vinha por aqui e o contrato
    // nunca era gerado -- aluno pagando a matricula e ficando sem documento
    // pra assinar.
    if (parcela.numero_parcela === 1) {
      await garantirContrato(sb, parcela.aluno_id).catch((e) =>
        console.error('efi-webhook: falha ao garantir contrato', parcela.aluno_id, e));
    }

    await gravar({ pagamento_id: parcela.id, acao: 'baixa', detalhe: `parcela ${parcela.numero_parcela} paga` });
    return ok({ recebido: true, acao: 'baixa', parcela: parcela.numero_parcela });
  } catch (e) {
    await gravar({ acao: 'erro', detalhe: `EXCECAO: ${(e as Error).message}` });
    return new Response(JSON.stringify({ erro: (e as Error).message }), { status: 500, headers: cors });
  }
});
