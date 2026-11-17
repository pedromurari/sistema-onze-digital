/**
 * diva-terapeuta-painel — dados do painel público do terapeuta do Divã
 * (/diva/terapeuta/:terapeutaId): próximas sessões vendidas pelo IDM +
 * disponibilidade cadastrada nos próximos 30 dias. Exige login (header
 * x-diva-token, emitido por diva-terapeuta-login) -- a identidade vem
 * sempre do token, nunca de um parâmetro da requisição, pra não dar pra
 * ler o painel de outro terapeuta trocando um id na mão.
 *
 * Cada venda em diva_sessoes pode ter mais de uma data marcada (pacote de
 * N sessões = até N horários ocupados em diva_disponibilidade_dias, cada
 * um com sessao_id apontando pra essa venda) -- por isso a lista de
 * "sessoes" devolvida aqui tem uma linha por data JÁ marcada, mais uma
 * linha extra (data_sessao null) se ainda sobrar sessão daquela venda sem
 * data combinada.
 *
 * GET com header x-diva-token
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-diva-token',
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(dataStr: string, dias: number): string {
  const d = new Date(`${dataStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function assinar(terapeutaId: string, expiraEm: number, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`diva-sessao:${terapeutaId}:${expiraEm}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function compararConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verificarToken(token: string | null, secret: string): Promise<string | null> {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [terapeutaId, expiraStr, assinatura] = partes;
  const expiraEm = Number(expiraStr);
  if (!terapeutaId || !expiraEm || !assinatura) return null;
  if (Math.floor(Date.now() / 1000) > expiraEm) return null;
  const esperado = await assinar(terapeutaId, expiraEm, secret);
  if (!compararConstante(esperado, assinatura)) return null;
  return terapeutaId;
}

interface Venda {
  id: string; cliente_nome: string; cliente_whatsapp: string | null; tipo: string;
  quantidade_sessoes: number; valor_total: number; status_pagamento: string;
}
interface Instancia { sessao_id: string; data: string; horario_inicio: string; horario_fim: string; }
interface LinhaPainel {
  data_sessao: string | null; horario_inicio: string | null; horario_fim: string | null;
  cliente_nome: string; cliente_whatsapp: string | null; tipo: string;
  quantidade_sessoes: number; valor_total: number; status_pagamento: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const terapeutaId = await verificarToken(req.headers.get('x-diva-token'), serviceKey);
  if (!terapeutaId) return respond(401, { error: 'sessao_expirada' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const { data: terapeuta, error: terapeutaError } = await supabase
      .from('diva_terapeutas')
      .select('id, nome, foto_url, status')
      .eq('id', terapeutaId)
      .maybeSingle();
    if (terapeutaError || !terapeuta) return respond(404, { error: 'Terapeuta não encontrado.' });

    const hoje = hojeBrasilia();
    const limite = somarDias(hoje, 30);

    const [vendasRes, instanciasRes, reservasRes, disponibilidadeRes] = await Promise.all([
      supabase
        .from('diva_sessoes')
        .select('id, cliente_nome, cliente_whatsapp, tipo, quantidade_sessoes, valor_total, status_pagamento')
        .eq('terapeuta_id', terapeutaId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('diva_disponibilidade_dias')
        .select('sessao_id, data, horario_inicio, horario_fim')
        .eq('terapeuta_id', terapeutaId)
        .eq('status', 'ocupado')
        .not('sessao_id', 'is', null),
      // Compromissos que a terapeuta já tinha (agenda dela) e ainda não
      // viraram venda no sistema -- aparecem igual a uma "sessão", só sem
      // valor/pagamento, pra ela ver nome e horário no calendário dela.
      supabase
        .from('diva_disponibilidade_dias')
        .select('data, horario_inicio, horario_fim, reservado_nome')
        .eq('terapeuta_id', terapeutaId)
        .eq('status', 'ocupado')
        .is('sessao_id', null)
        .not('reservado_nome', 'is', null),
      supabase
        .from('diva_disponibilidade_dias')
        .select('data, horario_inicio, horario_fim, status')
        .eq('terapeuta_id', terapeutaId)
        .gte('data', hoje)
        .lte('data', limite)
        .order('data')
        .order('horario_inicio'),
    ]);

    const vendas = (vendasRes.data ?? []) as Venda[];
    const instancias = (instanciasRes.data ?? []) as Instancia[];
    const reservas = (reservasRes.data ?? []) as Array<{ data: string; horario_inicio: string; horario_fim: string; reservado_nome: string }>;

    const instanciasPorVenda = new Map<string, Instancia[]>();
    for (const inst of instancias) {
      const lista = instanciasPorVenda.get(inst.sessao_id) ?? [];
      lista.push(inst);
      instanciasPorVenda.set(inst.sessao_id, lista);
    }

    // Uma linha por data já marcada dessa venda, mais uma linha "a combinar"
    // se sobrar sessão do pacote sem horário ainda.
    const sessoes: LinhaPainel[] = vendas.flatMap((v) => {
      const marcadas = (instanciasPorVenda.get(v.id) ?? []).sort((a, b) => a.data.localeCompare(b.data));
      const linhas: LinhaPainel[] = marcadas.map((inst) => ({
        data_sessao: inst.data, horario_inicio: inst.horario_inicio, horario_fim: inst.horario_fim,
        cliente_nome: v.cliente_nome, cliente_whatsapp: v.cliente_whatsapp, tipo: v.tipo,
        quantidade_sessoes: v.quantidade_sessoes, valor_total: v.valor_total, status_pagamento: v.status_pagamento,
      }));
      const pendente = (v.quantidade_sessoes ?? 1) - marcadas.length;
      if (pendente > 0) {
        linhas.push({
          data_sessao: null, horario_inicio: null, horario_fim: null,
          cliente_nome: v.cliente_nome, cliente_whatsapp: v.cliente_whatsapp, tipo: v.tipo,
          quantidade_sessoes: pendente, valor_total: v.valor_total, status_pagamento: v.status_pagamento,
        });
      }
      return linhas;
    });

    const linhasReserva: LinhaPainel[] = reservas.map((r) => ({
      data_sessao: r.data, horario_inicio: r.horario_inicio, horario_fim: r.horario_fim,
      cliente_nome: r.reservado_nome, cliente_whatsapp: null, tipo: 'reserva',
      quantidade_sessoes: 1, valor_total: 0, status_pagamento: 'reserva',
    }));

    const todasAsLinhas = [...sessoes, ...linhasReserva].sort((a, b) => {
      if (!a.data_sessao && !b.data_sessao) return 0;
      if (!a.data_sessao) return -1;
      if (!b.data_sessao) return 1;
      return b.data_sessao.localeCompare(a.data_sessao);
    });

    return respond(200, {
      terapeuta: { nome: terapeuta.nome, foto_url: terapeuta.foto_url, status: terapeuta.status },
      sessoes: todasAsLinhas,
      disponibilidade: disponibilidadeRes.data ?? [],
      janela: { hoje, limite },
    });
  } catch (error) {
    return respond(500, { error: 'Erro interno: ' + (error as Error).message });
  }
});
