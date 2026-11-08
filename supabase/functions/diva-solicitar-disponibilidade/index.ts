import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Pedido do Pedro (08/11/2026): pedir aos terapeutas aprovados do Divã IDM
// os dias/horários disponíveis esse mês, por WhatsApp -- um por vez, com
// bastante intervalo entre os envios (não é disparo em massa de uma vez só,
// pelo número dedicado "Divã IDM"). Cron tick: cada rodada manda UMA
// mensagem só (pro terapeuta aprovado mais antigo sem
// disponibilidade_solicitada_em ainda), igual ao padrão já usado em outros
// workers de envio throttled do projeto (ex: grupo-add-worker).

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key' };
function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function saudacao(): string {
  const hora = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
  return `Excelente ${hora < 12 ? 'dia' : hora < 18 ? 'tarde' : 'noite'}`;
}

function mesAtual(): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long' }).format(new Date());
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const chaveEsperada = await supabase.rpc('get_equipe_11ds_cron_secret').then((r) => r.data as string | null);
  const chaveRecebida = req.headers.get('x-cron-key');
  if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
    return respond(401, { error: 'Unauthorized' });
  }

  const { data: terapeuta, error: buscaError } = await supabase
    .from('diva_terapeutas')
    .select('id, nome, whatsapp')
    .eq('status', 'aprovado')
    .is('disponibilidade_solicitada_em', null)
    .not('whatsapp', 'is', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (buscaError) return respond(500, { error: buscaError.message });
  if (!terapeuta) return respond(200, { enviado: false, motivo: 'nenhum terapeuta pendente' });

  const primeiroNome = (terapeuta.nome as string).split(' ')[0];
  const mensagem = `${saudacao()}, ${primeiroNome}! 💙\n\nAqui é o time do Divã IDM. Pra gente organizar a agenda de sessões de ${mesAtual()}, você pode nos contar quais dias e horários você tem disponível esse mês pra atender?\n\nPode mandar livre (ex: "segundas e quartas, das 14h às 18h") que a gente já cadastra aqui do nosso lado. Qualquer dúvida, é só chamar por aqui mesmo!`;

  const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: JSON.stringify({ numero: terapeuta.whatsapp, mensagem, instance_name: 'Divã IDM' }),
  });

  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '');
    return respond(502, { error: `wpp-enviar falhou (HTTP ${resp.status}): ${corpo.slice(0, 300)}` });
  }

  const { error: updateError } = await supabase
    .from('diva_terapeutas')
    .update({ disponibilidade_solicitada_em: new Date().toISOString() })
    .eq('id', terapeuta.id);
  if (updateError) return respond(500, { error: `Enviado mas falhou ao salvar: ${updateError.message}` });

  return respond(200, { enviado: true, terapeuta: terapeuta.nome });
});
