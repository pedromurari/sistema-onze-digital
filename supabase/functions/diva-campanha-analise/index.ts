/**
 * diva-campanha-analise — campanha pros alunos ativos e EM DIA de
 * Psicanálise (pedido do Pedro, 09/11/2026): pergunta se já começaram a
 * própria análise (parte do tripé da formação) e oferece o Divã IDM.
 * Um envio por rodada (cron a cada 30min, só em horário comercial),
 * pelo número dedicado "Divã IDM". Fila: diva_campanha_analise_leads.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key' };
function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function agoraSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const hora = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const diaSemana = parts.find(p => p.type === 'weekday')?.value ?? '';
  return { hora, diaSemana };
}

function saudacao(hora: number): string {
  return `Excelente ${hora < 12 ? 'dia' : hora < 18 ? 'tarde' : 'noite'}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const chaveEsperada = await supabase.rpc('get_equipe_11ds_cron_secret').then((r) => r.data as string | null);
  const chaveRecebida = req.headers.get('x-cron-key');
  if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
    return respond(401, { error: 'Unauthorized' });
  }

  // Horário comercial: 8h-18h, segunda a sexta. Rede de segurança extra --
  // o cron já só roda nesses horários, isso aqui cobre teste manual/engano.
  const { hora, diaSemana } = agoraSaoPaulo();
  const diaUtil = !['Sat', 'Sun'].includes(diaSemana);
  if (!diaUtil || hora < 8 || hora >= 18) {
    return respond(200, { enviado: false, motivo: 'fora do horário comercial' });
  }

  const { data: lead, error: buscaError } = await supabase
    .from('diva_campanha_analise_leads')
    .select('id, nome, whatsapp')
    .is('enviado_em', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (buscaError) return respond(500, { error: buscaError.message });
  if (!lead) return respond(200, { enviado: false, motivo: 'fila vazia' });

  const primeiroNome = (lead.nome as string).split(' ')[0];
  const mensagem = `${saudacao(hora)}, ${primeiroNome}! 💙\n\nEsse é o número oficial do Divã IDM do Instituto Despertamente, nosso programa de terapia social. Passando pra te fazer uma pergunta importante: você já começou ou está em dia com a sua própria análise?\n\nLembrando que isso faz parte do tripé da formação em psicanálise — não dá pra formar de verdade sem vivenciar o processo na própria pele.\n\nPra facilitar isso pra você, temos o Divã IDM: sessões de psicanálise com terapeutas credenciados pelo próprio Instituto, a partir de R$80, sem fila de espera.\n\nMe conta: já está fazendo sua análise, ou quer que eu te ajude a começar?`;

  const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({ numero: lead.whatsapp, mensagem, instance_name: 'Divã IDM' }),
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '');
    return respond(502, { error: `wpp-enviar falhou (HTTP ${resp.status}): ${corpo.slice(0, 300)}` });
  }

  const { error: updateError } = await supabase
    .from('diva_campanha_analise_leads')
    .update({ enviado_em: new Date().toISOString() })
    .eq('id', lead.id);
  if (updateError) return respond(500, { error: `Enviado mas falhou ao salvar: ${updateError.message}` });

  return respond(200, { enviado: true, lead: lead.nome });
});
