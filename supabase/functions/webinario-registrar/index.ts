/**
 * webinario-registrar
 * Endpoint publico de cadastro do webinario evergreen.
 *
 * Fluxo normal: acha a proxima sessao dentro da tolerancia (5min atras ate
 * sempre pra frente), grava lead + tracking, manda confirmacao por
 * WhatsApp (numero da vendedora) com o link direto da sala.
 *
 * Fluxo "fora de horario": quando NAO existe sessao disponivel agora (ex:
 * de madrugada, fora da grade 06h-23h BRT, ou a grade do dia seguinte
 * ainda nao foi gerada pelo cron das 6h), em vez de falhar, devolve 3
 * horarios do dia seguinte (manha/tarde/noite) pro frontend oferecer num
 * popup. Quando o usuario escolhe um horario, o frontend reenvia o MESMO
 * form com `horarioEscolhido` (ISO) -- a funcao faz find-or-create da
 * sessao naquele horario exato (idempotente com o grid do cron, mesmo
 * padrao de dedup por inicio_em) e segue o fluxo normal a partir dali.
 * A confirmacao por WhatsApp sai na hora, independente do horario
 * escolhido ser so no dia seguinte -- quem avisa a pessoa NA HORA certa
 * de entrar e o webinario-lembrete-cron (dispara ~15min antes do inicio).
 *
 * Body: { webinarioSlug, nome, email, whatsapp, cidade?, utm_source?,
 *         utm_medium?, utm_campaign?, utm_content?, utm_term?, device?,
 *         variante_headline?, horarioEscolhido? }
 * Resposta (sucesso):      { ok: true, sessaoId, inicioEm, trackingId, leadId }
 * Resposta (fora horario): { ok: false, foraDeHorario: true, opcoes: [{inicioEm, periodo}] }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INSTANCIA_VENDEDORA = 'Helen vendas';

const limpar = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) || null : null;

// Proximo dia (civil, America/Sao_Paulo) as 09h/14h/20h BRT, como Date UTC.
function opcoesDoDiaSeguinte(agora: Date): { inicioEm: Date; periodo: 'manha' | 'tarde' | 'noite' }[] {
  const brtStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const [ano, mes, dia] = brtStr.split('-').map(Number);
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  const horasBrt: { h: number; periodo: 'manha' | 'tarde' | 'noite' }[] = [
    { h: 9, periodo: 'manha' },
    { h: 14, periodo: 'tarde' },
    { h: 20, periodo: 'noite' },
  ];
  return horasBrt.map(({ h, periodo }) => ({
    inicioEm: new Date(Date.UTC(amanha.getUTCFullYear(), amanha.getUTCMonth(), amanha.getUTCDate(), h + 3, 0, 0)),
    periodo,
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ ok: false, erro: 'use POST' }, 405);

  let entrada: Record<string, unknown>;
  try {
    entrada = await req.json();
  } catch {
    return json({ ok: false, erro: 'corpo invalido: esperado JSON' }, 400);
  }

  const nome = limpar(entrada.nome, 120);
  const whatsapp = limpar(entrada.whatsapp, 30);
  const email = limpar(entrada.email, 200);
  const webinarioSlug = limpar(entrada.webinarioSlug, 80);
  const horarioEscolhido = limpar(entrada.horarioEscolhido, 40);

  if (!nome || !email || !whatsapp || !webinarioSlug) {
    return json({ ok: false, erro: 'nome, email, whatsapp e webinarioSlug sao obrigatorios' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: webinario, error: errWeb } = await supabase
    .from('webinarios')
    .select('id, nome, produto_id, oferta_offset_segundos, time_comercial_campanha_id')
    .eq('slug', webinarioSlug)
    .eq('ativo', true)
    .maybeSingle();

  if (errWeb || !webinario) {
    return json({ ok: false, erro: 'webinario nao encontrado ou inativo' }, 404);
  }

  let sessao: { id: string; inicio_em: string } | null = null;

  if (horarioEscolhido) {
    // Usuario ja escolheu um horario no popup "fora de horario" -- faz
    // find-or-create da sessao exata (idempotente com o cron diario).
    const iso = new Date(horarioEscolhido).toISOString();
    const { data: existente } = await supabase
      .from('webinario_sessoes')
      .select('id, inicio_em')
      .eq('webinario_id', webinario.id)
      .eq('inicio_em', iso)
      .maybeSingle();
    if (existente) {
      sessao = existente;
    } else {
      const { data: criada, error: errCriar } = await supabase
        .from('webinario_sessoes')
        .insert({ webinario_id: webinario.id, inicio_em: iso, status: 'agendada' })
        .select('id, inicio_em')
        .single();
      if (errCriar || !criada) {
        console.error('webinario-registrar: falha ao criar sessao escolhida', errCriar);
        return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
      }
      sessao = criada;
    }
  } else {
    const agora = new Date();
    const tolerancia = new Date(agora.getTime() - 5 * 60 * 1000);
    const { data: proxima } = await supabase
      .from('webinario_sessoes')
      .select('id, inicio_em')
      .eq('webinario_id', webinario.id)
      .gte('inicio_em', tolerancia.toISOString())
      .order('inicio_em', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (proxima) {
      sessao = proxima;
    } else {
      // Fora de horario: devolve 3 opcoes do dia seguinte em vez de falhar.
      const opcoes = opcoesDoDiaSeguinte(agora).map((o) => ({ inicioEm: o.inicioEm.toISOString(), periodo: o.periodo }));
      return json({ ok: false, foraDeHorario: true, opcoes, webinarioNome: webinario.nome });
    }
  }

  if (!sessao) {
    return json({ ok: false, erro: 'nenhuma sessao disponivel no momento' }, 500);
  }

  const { data: lead, error: errLead } = await supabase
    .from('leads')
    .insert({
      nome,
      whatsapp,
      email,
      canal: 'Webinário',
      origem: 'Time Comercial',
      campanha_id: webinario.time_comercial_campanha_id,
      status: 'novo',
      produto: 'time_comercial',
      interesse_produto: webinario.nome,
      cidade: limpar(entrada.cidade, 120),
    })
    .select('id')
    .single();

  if (errLead || !lead) {
    console.error('webinario-registrar: falha ao gravar lead', errLead);
    return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
  }

  const { data: tracking, error: errTracking } = await supabase
    .from('webinario_tracking')
    .insert({
      lead_id: lead.id,
      sessao_id: sessao.id,
      watch_stage: 'registered',
      device: limpar(entrada.device, 40),
      utm_source: limpar(entrada.utm_source, 120),
      utm_medium: limpar(entrada.utm_medium, 120),
      utm_campaign: limpar(entrada.utm_campaign, 120),
      utm_content: limpar(entrada.utm_content, 120),
      utm_term: limpar(entrada.utm_term, 120),
      variante_headline: limpar(entrada.variante_headline, 20),
    })
    .select('id')
    .single();

  if (errTracking || !tracking) {
    console.error('webinario-registrar: falha ao criar tracking', errTracking);
    return json({ ok: false, erro: 'nao foi possivel registrar agora' }, 500);
  }

  // Confirmacao por WhatsApp AGORA (nao importa se a sessao escolhida e so
  // amanha) -- pelo numero da vendedora, com o link direto da sala. O
  // lembrete perto do horario de verdade e responsabilidade do
  // webinario-lembrete-cron.
  try {
    const horarioBr = new Date(sessao.inicio_em).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const linkSala = `https://sistema.idmpsi.com.br/webinario/sala/${sessao.id}?t=${tracking.id}`;
    const primeiroNome = nome.split(' ')[0];
    const mensagem = `Oi, ${primeiroNome}! 🎉\n\nSeu cadastro na aula "${webinario.nome}" foi confirmado.\n\n📅 Próxima sessão: ${horarioBr} (horário de Brasília)\n\n🔗 Link direto da sala (guarda esse link, ele já te leva pra aula certa):\n${linkSala}\n\nQualquer dúvida, é só chamar por aqui.`;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: JSON.stringify({ numero: whatsapp, mensagem, instance_name: INSTANCIA_VENDEDORA }),
    });
  } catch (e) {
    console.warn('webinario-registrar: confirmacao WhatsApp falhou:', (e as Error).message);
  }

  return json({ ok: true, sessaoId: sessao.id, inicioEm: sessao.inicio_em, trackingId: tracking.id, leadId: lead.id });
});
