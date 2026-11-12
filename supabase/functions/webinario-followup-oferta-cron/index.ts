/**
 * webinario-followup-oferta-cron
 * Roda a cada 5 minutos (pg_cron). Pedido explícito do Pedro (12/11/2026):
 * quem chega em 'cta_seen' (viu o pitch) ou 'offer_clicked' (clicou "quero
 * garantir minha vaga" e foi pra página de oferta) recebe o botão de
 * WhatsApp pra chamar a vendedora -- mas abrir o link não garante que a
 * pessoa realmente manda mensagem. Depois de um tempo de espera (deixa a
 * pessoa chamar sozinha primeiro), se ela NÃO mandou nenhuma mensagem de
 * verdade pro número da vendedora, o sistema manda uma mensagem automática
 * perguntando se ainda tem interesse -- não fica esperando a vendedora
 * notar sozinha no Kanban.
 *
 * Sinal de "já chamou" = existe alguma linha em whatsapp_mensagens com
 * direcao='recebida' pro telefone do lead, criada DEPOIS que ele chegou em
 * cta_seen/offer_clicked (mesma normalização de telefone do resto do
 * sistema -- ver toOptOutKey em funil-processar/disparo-runner).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'webinario-internal-2026';
const INSTANCIA_VENDEDORA = 'Helen vendas';

// Espera esse tempo depois de chegar na oferta antes de mandar o follow-up
// -- dá chance da pessoa chamar sozinha primeiro.
const ESPERA_MINUTOS = 15;

function foneParaChave(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if ((d.length === 13 || d.length === 12) && d.startsWith('55')) return d.slice(2);
  return d.slice(-11);
}

// Mesmo padrao de registrarMensagemEnviada do funil-processar/boas-vindas --
// sem isso, a mensagem sai de verdade mas nunca aparece na aba Chat do
// Time Comercial (so o `wpp-enviar` manda, quem grava historico e quem chama).
async function registrarMensagemEnviada(
  supabase: ReturnType<typeof createClient>,
  whatsapp: string,
  conteudo: string,
): Promise<void> {
  try {
    const telefone = foneParaChave(whatsapp);
    if (!telefone) return;
    await supabase.from('whatsapp_mensagens').insert({
      telefone,
      direcao: 'enviada',
      conteudo,
      tipo: 'text',
      origem: 'webinario_followup_oferta',
      evolution_instance: INSTANCIA_VENDEDORA,
    });
  } catch (e) {
    console.error('webinario-followup-oferta-cron: registrarMensagemEnviada falhou:', (e as Error).message);
  }
}

serve(async (req) => {
  const cronKey = req.headers.get('x-cron-key');
  if (cronKey !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const limite = new Date(Date.now() - ESPERA_MINUTOS * 60 * 1000).toISOString();

  const { data: trackings, error: errTracking } = await supabase
    .from('webinario_tracking')
    .select('id, lead_id, sessao_id, watch_stage, updated_at')
    .in('watch_stage', ['cta_seen', 'offer_clicked'])
    .is('followup_oferta_enviado_em', null)
    .lte('updated_at', limite);

  if (errTracking) {
    return new Response(JSON.stringify({ ok: false, erro: errTracking.message }), { status: 500 });
  }
  if (!trackings?.length) {
    return new Response(JSON.stringify({ ok: true, enviados: 0, pulados: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  let enviados = 0;
  let pulados = 0;

  for (const tracking of trackings) {
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('nome, whatsapp')
        .eq('id', tracking.lead_id)
        .maybeSingle();

      if (!lead?.whatsapp) {
        await supabase.from('webinario_tracking').update({ followup_oferta_enviado_em: new Date().toISOString() }).eq('id', tracking.id);
        continue;
      }

      // Já chamou a vendedora de verdade (mensagem recebida depois de ver a
      // oferta)? Então não manda o follow-up -- só marca como resolvido.
      const chave = foneParaChave(lead.whatsapp);
      const { data: jaChamou } = await supabase
        .from('whatsapp_mensagens')
        .select('id')
        .eq('telefone', chave)
        .eq('direcao', 'recebida')
        .gte('created_at', tracking.updated_at)
        .limit(1)
        .maybeSingle();

      if (jaChamou) {
        await supabase.from('webinario_tracking').update({ followup_oferta_enviado_em: new Date().toISOString() }).eq('id', tracking.id);
        pulados++;
        continue;
      }

      const { data: sessao } = await supabase
        .from('webinario_sessoes')
        .select('webinario_id')
        .eq('id', tracking.sessao_id)
        .maybeSingle();
      const { data: webinario } = sessao
        ? await supabase.from('webinarios').select('nome').eq('id', sessao.webinario_id).maybeSingle()
        : { data: null };

      const primeiroNome = (lead.nome as string).split(' ')[0];
      const nomeAula = webinario?.nome ?? 'o webinário';
      const mensagem = `Oi, ${primeiroNome}! 💛\n\nVi que você chegou até a parte da oferta em "${nomeAula}" -- a Formação em Psicanálise Clínica Integrativa.\n\nAinda tem interesse em saber as condições? Me chama aqui que eu te conto tudo com calma!`;

      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/wpp-enviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: JSON.stringify({ numero: lead.whatsapp, mensagem, instance_name: INSTANCIA_VENDEDORA }),
      });
      await registrarMensagemEnviada(supabase, lead.whatsapp, mensagem);

      await supabase.from('webinario_tracking').update({ followup_oferta_enviado_em: new Date().toISOString() }).eq('id', tracking.id);
      enviados++;
    } catch (e) {
      console.warn('webinario-followup-oferta-cron: falha no tracking', tracking.id, (e as Error).message);
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados, pulados }), { headers: { 'Content-Type': 'application/json' } });
});
