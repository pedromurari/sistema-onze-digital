/**
 * ceo-relatorio-departamento
 * Monta e manda pro grupo de WhatsApp do departamento um resumo dos mesmos
 * números já exibidos na Diretoria daquele departamento (nada recalculado
 * do zero, só formatado em texto). Disparo manual pelo botão "Enviar pro
 * grupo" na tela CEO -- Fase 2 do plano de Rotina do CEO, pedido do Pedro.
 *
 * Diferente do ceo-relatorio-financeiro (que é automático via cron), este
 * é sempre acionado por um admin logado -- autentica o chamador e confere
 * is_admin() antes de mandar qualquer coisa.
 *
 * Body: { departamento: 'comercial' | 'pedagogico' | 'marketing' | 'rh' }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function reais(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function inicioMesBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-01`;
}

async function montarComercial(sb: ReturnType<typeof createClient>) {
  const inicioMes = inicioMesBrasil();
  const hoje = hojeBrasil();
  const [hojeRes, mesRes, fechadosRes, followupRes, comMesRes, comPendRes] = await Promise.all([
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').gte('criado_em', `${hoje}T00:00:00`),
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').gte('criado_em', `${inicioMes}T00:00:00`),
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').eq('status', 'fechado').gte('criado_em', `${inicioMes}T00:00:00`),
    sb.from('leads').select('id', { count: 'exact', head: true }).eq('origem', 'Time Comercial').eq('status', 'followup').lt('followup_manual_prazo', hoje),
    sb.from('comissoes_vendedores').select('valor_venda, valor_comissao').eq('tipo', 'comissao').gte('data_venda', inicioMes),
    sb.from('comissoes_vendedores').select('valor_comissao').in('status', ['pendente', 'reservado']),
  ]);
  const leadsMes = mesRes.count ?? 0;
  const fechadosMes = fechadosRes.count ?? 0;
  const conversao = leadsMes > 0 ? (fechadosMes / leadsMes) * 100 : 0;
  const faturamentoMes = ((comMesRes.data as { valor_venda: number }[] | null) ?? []).reduce((s, c) => s + Number(c.valor_venda), 0);
  const comissaoPendente = ((comPendRes.data as { valor_comissao: number }[] | null) ?? []).reduce((s, c) => s + Number(c.valor_comissao), 0);

  return `📊 *Comercial — ${new Date().toLocaleDateString('pt-BR')}*\n\n`
    + `Leads hoje: ${hojeRes.count ?? 0} · no mês: ${leadsMes}\n`
    + `Conversão do mês: ${conversao.toFixed(1)}% (${fechadosMes} fechado(s))\n`
    + `Follow-ups vencidos: ${followupRes.count ?? 0}\n`
    + `Faturado no mês: ${reais(faturamentoMes)}\n`
    + `Comissão a pagar: ${reais(comissaoPendente)}`;
}

async function montarPedagogico(sb: ReturnType<typeof createClient>) {
  const inicioMes = inicioMesBrasil();
  const hoje = hojeBrasil();
  const [hojeRes, mesRes, avalRes, revRes] = await Promise.all([
    sb.from('aulas').select('id', { count: 'exact', head: true }).eq('data', hoje),
    sb.from('aulas').select('id', { count: 'exact', head: true }).eq('status', 'realizada').gte('data', inicioMes),
    sb.from('ped_avaliacoes').select('status'),
    sb.from('ped_revisoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
  ]);
  const avaliacoes = (avalRes.data as { status: string }[] | null) ?? [];
  const publicadas = avaliacoes.filter(a => a.status === 'publicada').length;
  const rascunho = avaliacoes.filter(a => a.status === 'rascunho').length;

  return `📊 *Pedagógico — ${new Date().toLocaleDateString('pt-BR')}*\n\n`
    + `Aulas hoje: ${hojeRes.count ?? 0} · realizadas no mês: ${mesRes.count ?? 0}\n`
    + `Avaliações publicadas / rascunho: ${publicadas} / ${rascunho}\n`
    + `Revisões pendentes: ${revRes.count ?? 0}`;
}

async function montarMarketing(sb: ReturnType<typeof createClient>) {
  const inicioMes = inicioMesBrasil();
  const proximoMes = (() => {
    const [ano, mes] = inicioMes.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  })();
  const etapas = ['ideia', 'roteiro', 'gravando', 'editando', 'aprovado', 'agendado'] as const;
  const contagens = await Promise.all(etapas.map(e => sb.from('conteudo_calendario').select('id', { count: 'exact', head: true }).eq('status', e)));
  const publicadosRes = await sb.from('conteudo_calendario').select('id', { count: 'exact', head: true }).eq('status', 'publicado').gte('data_publicacao', inicioMes).lt('data_publicacao', proximoMes);
  const porEtapa = Object.fromEntries(etapas.map((e, i) => [e, contagens[i].count ?? 0]));
  const emProducao = ['ideia', 'roteiro', 'gravando', 'editando'].reduce((t, e) => t + (porEtapa[e] ?? 0), 0);

  return `📊 *Marketing — ${new Date().toLocaleDateString('pt-BR')}*\n\n`
    + `Em produção: ${emProducao}\n`
    + `Em revisão: ${porEtapa.editando ?? 0}\n`
    + `Prontos / programados: ${porEtapa.aprovado ?? 0} / ${porEtapa.agendado ?? 0}\n`
    + `Publicados no mês: ${publicadosRes.count ?? 0}`;
}

async function montarRH(sb: ReturnType<typeof createClient>) {
  const inicioMes = inicioMesBrasil();
  const proximoMes = (() => {
    const [ano, mes] = inicioMes.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  })();
  const [ativosRes, pagRes, semNotaRes, pendRes, contasRes] = await Promise.all([
    sb.from('profissionais').select('id', { count: 'exact', head: true }).eq('ativo', true),
    sb.from('profissionais_pagamentos').select('valor').gte('data_pagamento', inicioMes).lt('data_pagamento', proximoMes),
    sb.from('profissionais_pagamentos').select('valor').is('nota_fiscal_arquivo_url', null).gte('data_pagamento', inicioMes).lt('data_pagamento', proximoMes),
    sb.from('presencas_pendentes_revisao').select('id', { count: 'exact', head: true }).eq('resolvido', false),
    sb.from('folha_fechamentos_itens').select('total_sugerido'),
  ]);
  const totalPagoMes = ((pagRes.data as { valor: number }[] | null) ?? []).reduce((s, p) => s + Number(p.valor), 0);
  const semNota = (semNotaRes.data as { valor: number }[] | null) ?? [];
  const valorSemNota = semNota.reduce((s, p) => s + Number(p.valor), 0);
  const totalContasAPagar = ((contasRes.data as { total_sugerido: number }[] | null) ?? []).reduce((s, c) => s + Number(c.total_sugerido), 0);

  return `📊 *RH — ${new Date().toLocaleDateString('pt-BR')}*\n\n`
    + `Profissionais ativos: ${ativosRes.count ?? 0}\n`
    + `Pago este mês: ${reais(totalPagoMes)}\n`
    + `Sem nota fiscal (mês): ${semNota.length} (${reais(valorSemNota)})\n`
    + `Presenças pendentes de revisão: ${pendRes.count ?? 0}\n`
    + `Contas a pagar em aberto: ${reais(totalContasAPagar)}`;
}

const MONTADORES: Record<string, (sb: ReturnType<typeof createClient>) => Promise<string>> = {
  comercial: montarComercial,
  pedagogico: montarPedagogico,
  marketing: montarMarketing,
  rh: montarRH,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ ok: false, erro: 'não autorizado' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, erro: 'não autorizado' }, 401);

    const { data: ehAdmin } = await userClient.rpc('is_admin');
    if (!ehAdmin) return json({ ok: false, erro: 'só admin pode enviar relatório de departamento' }, 403);

    const { departamento, preview } = await req.json().catch(() => ({})) as { departamento?: string; preview?: boolean };
    const montador = departamento ? MONTADORES[departamento] : undefined;
    if (!montador) return json({ ok: false, erro: 'departamento deve ser comercial, pedagogico, marketing ou rh' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const texto = await montador(admin);
    if (preview) return json({ ok: true, texto });

    const { data: grupo } = await admin
      .from('ceo_rotina_grupos')
      .select('grupo_jid, instancia, ativo')
      .eq('departamento', departamento)
      .single();
    if (!grupo || !grupo.ativo) return json({ ok: false, erro: 'grupo não configurado/ativo' }, 400);

    const envioRes = await fetch(`${url}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ numero: grupo.grupo_jid, mensagem: texto, instance_name: grupo.instancia }),
    });
    const envioJson = await envioRes.json().catch(() => ({}));
    if (!envioJson.ok) return json({ ok: false, erro: envioJson.error ?? 'falha no envio', texto }, 502);

    return json({ ok: true, texto, envio: envioJson });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
