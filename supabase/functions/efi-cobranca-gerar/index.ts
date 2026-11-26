/**
 * efi-cobranca-gerar -- gera Pix ou boleto da Efi pra uma parcela (26/11/2026).
 *
 * REGRA DE OURO: nunca cria cobranca nova por cima de uma viva. Hoje ha
 * Pix da SyncPay e do Mercado Pago ainda validos em parcelas abertas, e
 * dois Pix vivos na mesma parcela e risco de pagamento em dobro. Quem
 * decide se ja existe algo valido e `jaTemCobrancaViva`.
 *
 * TXID DETERMINISTICO: o txid do Pix e o `pagamentos.id` sem hifens -- 32
 * caracteres alfanumericos, dentro do formato do BC. Isso da duas coisas
 * de graca: a baixa acha a parcela sem busca por valor, e chamar duas
 * vezes nao cria duas cobrancas (PUT /v2/cob/:txid e idempotente).
 *
 * BOLETO: vence em 3 dias uteis a partir de hoje (decisao do Pedro,
 * 26/11/2026) -- parcela vencida nao pode ser emitida com data no
 * passado. Feriado nacional ainda NAO e considerado, so fim de semana.
 *
 * ENCARGOS: desligados. O contrato atual nao preve percentual de multa
 * nem juros (clausula 5.1 remete ao documento de cobranca, e o documento
 * nao informa nada). So liga pra contrato novo, depois do juridico.
 *
 * CLOUDFLARE: a Efi fica atras de Cloudflare, que barra User-Agent de
 * cliente HTTP padrao com 403 "error code: 1010". Todo fetch manda UA.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UA = 'IDM-CRM/1.0';
const COB = { homolog: 'https://cobrancas-h.api.efipay.com.br', producao: 'https://cobrancas.api.efipay.com.br' };
const PIX = { homolog: 'https://pix-h.api.efipay.com.br', producao: 'https://pix.api.efipay.com.br' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-financeiro-key, x-cron-key',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 1), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type Amb = 'homolog' | 'producao';
const sufixo = (a: Amb) => (a === 'homolog' ? '_HOMOLOG' : '');
const env = (nome: string, a: Amb) => Deno.env.get(`${nome}${sufixo(a)}`);

function deB64(s: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

function diasUteis(n: number): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000); // hoje em Brasilia
  let restam = n;
  while (restam > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) restam--;
  }
  return d.toISOString().slice(0, 10);
}

/** Cliente mTLS. So o Pix precisa; o boleto fala sem certificado. */
function clientePix(amb: Amb) {
  const cert = env('EFI_CERT', amb) ?? Deno.env.get(amb === 'homolog' ? 'EFI_CERT_HOMOLOG_PEM_B64' : 'EFI_CERT_PEM_B64');
  const key = env('EFI_KEY', amb) ?? Deno.env.get(amb === 'homolog' ? 'EFI_KEY_HOMOLOG_PEM_B64' : 'EFI_KEY_PEM_B64');
  if (!cert || !key) throw new Error(`certificado PEM ausente para ${amb}`);
  return (Deno as any).createHttpClient({ cert: deB64(cert), key: deB64(key) });
}

async function token(amb: Amb, tipo: 'pix' | 'boleto', client?: any): Promise<string> {
  const id = env('EFI_CLIENT_ID', amb);
  const secret = env('EFI_CLIENT_SECRET', amb);
  if (!id || !secret) throw new Error(`credenciais ausentes para ${amb}`);
  const host = tipo === 'pix' ? PIX[amb] : COB[amb];
  const caminho = tipo === 'pix' ? '/oauth/token' : '/v1/authorize';
  const r = await fetch(`${host}${caminho}`, {
    ...(client ? { client } : {}),
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
  if (!r.ok) throw new Error(`auth ${tipo} ${r.status}: ${txt.slice(0, 200)}`);
  return JSON.parse(txt).access_token;
}

/**
 * Ha cobranca viva nesta parcela? Qualquer gateway conta.
 * O Pix da Efi expira (efi_expira_em); os outros nao temos como saber ao
 * certo, entao a presenca do link ja basta pra nao gerar por cima.
 */
function jaTemCobrancaViva(p: any, tipo: 'pix' | 'boleto'): string | null {
  if (tipo === 'pix') {
    if (p.link_pagamento_syncpay) return 'syncpay';
    if (p.link_pagamento_mp) return 'mercadopago';
    if (p.link_pagamento_efi && (!p.efi_expira_em || new Date(p.efi_expira_em) > new Date())) return 'efi';
  } else {
    if (p.link_pagamento_voomp) return 'voomp';
    if (p.link_pagamento_asaas) return 'asaas';
    if (p.link_boleto_efi && (!p.efi_expira_em || new Date(p.efi_expira_em) > new Date())) return 'efi';
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const chave = Deno.env.get('FINANCEIRO_INSTANCE_KEY') ?? 'financeiro-only-idm-2026';
  if (req.headers.get('x-financeiro-key') !== chave && req.headers.get('x-cron-key') !== chave) {
    return json({ erro: 'nao autorizado' }, 403);
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let client: any = null;

  try {
    const body = await req.json().catch(() => ({})) as {
      pagamento_id?: string; tipo?: 'pix' | 'boleto'; ambiente?: Amb; forcar?: boolean;
    };
    const tipo = body.tipo === 'boleto' ? 'boleto' : 'pix';
    const amb: Amb = body.ambiente === 'producao' ? 'producao' : 'homolog';
    if (!body.pagamento_id) return json({ erro: 'pagamento_id obrigatorio' }, 400);

    const { data: p, error: erroP } = await sb
      .from('pagamentos')
      .select('id, aluno_id, numero_parcela, valor, status, produto, data_vencimento, ' +
        'link_pagamento_syncpay, link_pagamento_mp, link_pagamento_voomp, link_pagamento_asaas, ' +
        'link_pagamento_efi, link_boleto_efi, efi_txid, efi_charge_id, efi_expira_em')
      .eq('id', body.pagamento_id)
      .maybeSingle();

    if (erroP) return json({ erro: `leitura falhou: ${erroP.message}` }, 500);
    if (!p) return json({ erro: 'parcela nao encontrada' }, 404);
    if (p.status === 'pago') return json({ ja_pago: true, erro: 'parcela ja esta paga' }, 409);

    // Homologacao NAO grava na parcela. Cobranca de sandbox nao existe no
    // banco de verdade -- se ficasse gravada, o checkout mostraria pro
    // aluno um boleto falso que nenhum banco paga. Aprendido na marra em
    // 26/11/2026, testando contra uma parcela real.
    const gravar = amb === 'producao';

    const vivo = body.forcar ? null : jaTemCobrancaViva(p, tipo);
    if (vivo) {
      return json({
        gerado: false, reaproveitado: vivo,
        motivo: `ja existe ${tipo} vivo (${vivo}) nesta parcela -- gerar outro arriscaria pagamento em dobro`,
        pix: p.link_pagamento_efi ?? p.link_pagamento_syncpay ?? p.link_pagamento_mp ?? null,
        boleto: p.link_boleto_efi ?? p.link_pagamento_voomp ?? p.link_pagamento_asaas ?? null,
      });
    }

    const { data: aluno } = await sb
      .from('alunos').select('nome, cpf, email, whatsapp').eq('id', p.aluno_id).maybeSingle();
    const cpf = String(aluno?.cpf ?? '').replace(/\D/g, '');
    if (cpf.length !== 11) return json({ erro: 'aluno sem CPF valido no cadastro' }, 422);
    const nome = String(aluno?.nome ?? '').trim().slice(0, 60);

    // ---------------------------------------------------------------- PIX
    if (tipo === 'pix') {
      const chavePix = env('EFI_PIX_CHAVE', amb);
      if (!chavePix) return json({ erro: `EFI_PIX_CHAVE${sufixo(amb)} nao configurada` }, 422);

      const txid = String(p.id).replace(/-/g, '');
      client = clientePix(amb);
      const t = await token(amb, 'pix', client);

      const expiracaoSegundos = 3 * 24 * 60 * 60; // 3 dias, mesmo prazo do boleto
      const r = await fetch(`${PIX[amb]}/v2/cob/${txid}`, {
        client,
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${t}`, 'Content-Type': 'application/json',
          Accept: 'application/json', 'User-Agent': UA,
        },
        body: JSON.stringify({
          calendario: { expiracao: expiracaoSegundos },
          devedor: { cpf, nome },
          valor: { original: Number(p.valor).toFixed(2) },
          chave: chavePix,
          solicitacaoPagador: `Parcela ${p.numero_parcela} - Instituto Despertamente`,
        }),
        signal: AbortSignal.timeout(30_000),
      } as any);

      const txt = await r.text();
      let cob: any; try { cob = JSON.parse(txt); } catch { cob = { nao_json: txt.slice(0, 400) }; }
      if (!r.ok || !cob?.pixCopiaECola) return json({ erro: 'Efi recusou a cobranca Pix', http: r.status, resposta: cob }, 502);

      const expira = new Date(Date.now() + expiracaoSegundos * 1000).toISOString();
      if (gravar) {
        await sb.from('pagamentos').update({
          efi_txid: cob.txid ?? txid,
          link_pagamento_efi: cob.pixCopiaECola,
          efi_expira_em: expira,
        }).eq('id', p.id);
      }

      return json({
        gerado: true, tipo: 'pix', ambiente: amb, gravado_na_parcela: gravar,
        txid: cob.txid ?? txid, pix: cob.pixCopiaECola, expira_em: expira,
      });
    }

    // ------------------------------------------------------------- BOLETO
    const vencimento = diasUteis(3);
    const t = await token(amb, 'boleto');
    const r = await fetch(`${COB[amb]}/v1/charge/one-step`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t}`, 'Content-Type': 'application/json',
        Accept: 'application/json', 'User-Agent': UA,
      },
      body: JSON.stringify({
        items: [{
          name: `Parcela ${p.numero_parcela} - Instituto Despertamente`,
          value: Math.round(Number(p.valor) * 100),
          amount: 1,
        }],
        metadata: {
          custom_id: p.id, // e por aqui que a baixa acha a parcela
          notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/efi-webhook?amb=${amb}`,
        },
        payment: {
          banking_billet: {
            expire_at: vencimento,
            customer: {
              name: nome, cpf,
              email: aluno?.email || undefined,
              phone_number: String(aluno?.whatsapp ?? '').replace(/\D/g, '').slice(-11) || undefined,
            },
            message: 'Instituto Despertamente - pagamento de parcela.',
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const txt = await r.text();
    let res: any; try { res = JSON.parse(txt); } catch { res = { nao_json: txt.slice(0, 400) }; }
    const d = res?.data;
    if (!r.ok || !d?.link) return json({ erro: 'Efi recusou o boleto', http: r.status, resposta: res }, 502);

    if (gravar) {
      await sb.from('pagamentos').update({
        efi_charge_id: d.charge_id ?? null,
        link_boleto_efi: d.link,
        efi_expira_em: `${vencimento}T23:59:59-03:00`,
      }).eq('id', p.id);
    }

    return json({
      gerado: true, tipo: 'boleto', ambiente: amb, gravado_na_parcela: gravar,
      charge_id: d.charge_id, boleto: d.link, pdf: d.pdf?.charge ?? null,
      barcode: d.barcode ?? null, vencimento,
    });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  } finally {
    try { client?.close?.(); } catch { /* ignora */ }
  }
});
