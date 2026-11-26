/**
 * efi-pix-webhook -- recebe a notificacao de Pix da Efi (26/11/2026).
 *
 * DIFERENTE DO WEBHOOK DE BOLETO: aqui a Efi manda o dado do pagamento no
 * proprio corpo (endToEndId, txid, valor, horario). Mesmo assim o corpo
 * NAO e tratado como fato -- o que vale e consultar GET /v2/cob/{txid} e
 * ver `status: CONCLUIDA`. Licao do incidente syncpay-webhook
 * (19-22/11/2026), em que 10 vendas forjadas entraram porque o sistema
 * acreditou no payload.
 *
 * mTLS: por norma do BC a Efi exige mTLS no webhook, e o Edge Runtime do
 * Supabase nao consegue exigir certificado de cliente. O cadastro e feito
 * com o header `x-skip-mtls-checking` (nao documentado, mas aceito --
 * testado em 26/11/2026). Isso tira a prova de origem, o que torna a
 * consulta de volta obrigatoria, nao opcional.
 *
 * A Efi acrescenta "/pix" ao final da URL cadastrada. O Supabase roteia
 * .../efi-pix-webhook/pix pra esta mesma funcao, entao nao ha o que fazer.
 *
 * O cadastro do webhook faz um POST de teste sem corpo util: qualquer
 * requisicao sem o array `pix` responde 200 e nao processa nada.
 *
 * LIGACAO COM A PARCELA: o txid e o `pagamentos.id` sem os hifens (32
 * caracteres alfanumericos, dentro do formato que o BC exige). Nao ha
 * busca por valor, que colidiria entre alunos com a mesma mensalidade.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UA = 'IDM-CRM/1.0';
const HOSTS = {
  homolog: 'https://pix-h.api.efipay.com.br',
  producao: 'https://pix.api.efipay.com.br',
};

const PRODUTO_LABEL: Record<string, string> = {
  psicanalise: 'Formação em Psicanálise',
  numerologia: 'Mentoria NPS',
  pnl: 'Formação em PNL',
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const ok = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, 'Content-Type': 'application/json' } });

function deB64(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

/** txid -> pagamentos.id. O inverso de id.replace(/-/g,''). */
function txidParaUuid(txid: string): string | null {
  const h = txid.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h)) return null;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function fazCliente(amb: 'homolog' | 'producao') {
  const cert = Deno.env.get(amb === 'homolog' ? 'EFI_CERT_HOMOLOG_PEM_B64' : 'EFI_CERT_PEM_B64');
  const key = Deno.env.get(amb === 'homolog' ? 'EFI_KEY_HOMOLOG_PEM_B64' : 'EFI_KEY_PEM_B64');
  if (!cert || !key) throw new Error(`certificado PEM ausente para ${amb}`);
  return (Deno as any).createHttpClient({ cert: deB64(cert), key: deB64(key) });
}

async function token(client: any, amb: 'homolog' | 'producao'): Promise<string> {
  const id = Deno.env.get(amb === 'homolog' ? 'EFI_CLIENT_ID_HOMOLOG' : 'EFI_CLIENT_ID');
  const secret = Deno.env.get(amb === 'homolog' ? 'EFI_CLIENT_SECRET_HOMOLOG' : 'EFI_CLIENT_SECRET');
  if (!id || !secret) throw new Error(`credenciais ausentes para ${amb}`);
  const r = await fetch(`${HOSTS[amb]}/oauth/token`, {
    client,
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(25_000),
  } as any);
  const txt = await r.text();
  if (!r.ok) throw new Error(`oauth ${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt).access_token;
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
    template_nome: 'Confirmação de pagamento (Efí Pix)',
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

  const bruto = await req.text().catch(() => '');
  let payload: any = null;
  try { payload = JSON.parse(bruto); } catch { /* corpo nao-JSON: e o teste de cadastro */ }

  const itens: any[] = Array.isArray(payload?.pix) ? payload.pix : [];

  // O cadastro do webhook faz um POST de teste. Responder 2XX e o que ele
  // espera; sem o array `pix` nao ha nada pra processar.
  if (!itens.length) {
    await sb.from('efi_webhook_logs').insert({
      corpo_bruto: bruto.slice(0, 2000),
      acao: 'ignorado',
      detalhe: 'POST sem array pix (teste de cadastro ou ping)',
    });
    return ok({ recebido: true, acao: 'ignorado' });
  }

  let client: any = null;
  try {
    client = fazCliente(amb);
    const t = await token(client, amb);
    const resultados: unknown[] = [];

    for (const item of itens) {
      const txid = String(item?.txid ?? '');
      const log: Record<string, unknown> = {
        corpo_bruto: JSON.stringify(item).slice(0, 2000),
        custom_id: txid,
      };
      const gravar = async (extra: Record<string, unknown>) => {
        try {
          const { error } = await sb.from('efi_webhook_logs').insert({ ...log, ...extra });
          if (error) console.error('efi-pix-webhook: falha ao gravar log:', error.message);
        } catch (e) {
          console.error('efi-pix-webhook: excecao ao gravar log:', e);
        }
      };

      if (!txid) { await gravar({ acao: 'erro', detalhe: 'item sem txid' }); continue; }

      // --- A consulta. Fonte da verdade, porque o payload nao prova nada. ---
      const r = await fetch(`${HOSTS[amb]}/v2/cob/${encodeURIComponent(txid)}`, {
        client,
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(25_000),
      } as any);
      const txt = await r.text();
      let cob: any; try { cob = JSON.parse(txt); } catch { cob = { nao_json: txt.slice(0, 400) }; }

      log.consulta_status = r.status;
      log.consulta_resposta = cob;
      log.status_efi = cob?.status ?? null;

      if (!r.ok) { await gravar({ acao: 'erro', detalhe: `consulta ${r.status}` }); continue; }
      if (String(cob?.status) !== 'CONCLUIDA') {
        await gravar({ acao: 'ignorado', detalhe: `status ${cob?.status} nao exige baixa` });
        continue;
      }

      const pagamentoId = txidParaUuid(txid);
      if (!pagamentoId) { await gravar({ acao: 'erro', detalhe: 'txid fora do formato de pagamentos.id' }); continue; }

      const { data: parcela } = await sb
        .from('pagamentos')
        .select('id, aluno_id, numero_parcela, valor, status, produto')
        .eq('id', pagamentoId)
        .maybeSingle();

      if (!parcela) { await gravar({ acao: 'erro', detalhe: `txid ${txid} nao bate com parcela` }); continue; }

      // O valor confirmado pela Efi tem que bater com a parcela. Pix pago
      // a menor existe, e baixar a parcela inteira por causa dele seria
      // perder dinheiro em silencio.
      const pago = Number(cob?.valor?.original ?? 0);
      const devido = Number(parcela.valor);
      if (pago > 0 && Math.abs(pago - devido) > 0.01) {
        await gravar({
          pagamento_id: parcela.id, acao: 'erro',
          detalhe: `valor divergente: Efi ${pago} x parcela ${devido} -- baixa NAO aplicada`,
        });
        continue;
      }

      if (parcela.status === 'pago') {
        await gravar({ pagamento_id: parcela.id, acao: 'ignorado', detalhe: 'parcela ja estava paga' });
        continue;
      }

      const hojeBr = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { error: upErr } = await sb
        .from('pagamentos')
        .update({ status: 'pago', data_pagamento: hojeBr, conta_recebimento: 'efi' })
        .eq('id', parcela.id);

      if (upErr) { await gravar({ pagamento_id: parcela.id, acao: 'erro', detalhe: `baixa falhou: ${upErr.message}` }); continue; }

      await confirmarPagamento(sb, parcela as any).catch((e) =>
        console.error('efi-pix-webhook: falha na confirmacao', parcela.id, e));

      await gravar({ pagamento_id: parcela.id, acao: 'baixa', detalhe: `parcela ${parcela.numero_parcela} paga via Pix` });
      resultados.push({ txid, baixa: true, parcela: parcela.numero_parcela });
    }

    return ok({ recebido: true, processados: itens.length, resultados });
  } catch (e) {
    await sb.from('efi_webhook_logs').insert({
      corpo_bruto: bruto.slice(0, 2000),
      acao: 'erro',
      detalhe: `EXCECAO: ${(e as Error).message}`,
    });
    return new Response(JSON.stringify({ erro: (e as Error).message }), { status: 500, headers: cors });
  } finally {
    try { client?.close?.(); } catch { /* ignora */ }
  }
});
