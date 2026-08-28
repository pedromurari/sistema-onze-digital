/**
 * time-comercial-followup-alerta
 * Roda 1x por dia (cron, ver migration correspondente) e manda 1 mensagem de
 * WhatsApp por vendedor, listando todos os leads com follow-up manual vencido
 * (etapa "followup", `leads.followup_manual_prazo <= hoje`). É o 3º dos "3
 * avisos" pedidos pelo Pedro em 2026-08-27 (junto do destaque visual no card
 * e do card-resumo "Aguardando Follow-up" no topo da tela, já feitos no
 * frontend) -- esse aqui é o único que precisa de um cron de verdade.
 *
 * Diferente do sistema de sequência automática de follow-up que já existe
 * (followup-vendedor-enviar, followup_sequencia_id/followup_passo_atual) --
 * aquele manda mensagem PRO LEAD; este manda mensagem PRO VENDEDOR avisando
 * que precisa agir. Não confundir os dois.
 *
 * Números de WhatsApp dos vendedores: mesma fonte que
 * src/lib/vendedores.ts (INITIAL_VENDORS[].whatsapp) -- duplicado aqui
 * porque essa function roda em Deno, não importa código do frontend.
 * Atualize os dois lugares juntos se o número mudar.
 *
 * Auth: só aceita chamada com o header `x-cron-key` batendo com
 * public.get_equipe_11ds_cron_secret() (secret genérica do projeto, mesmo
 * padrão de followup-vendedor-enviar/matricula-boleto-mensal-gerar).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

// Mesma fonte que src/lib/vendedores.ts -- ver comentário no topo do arquivo.
const VENDEDOR_WHATSAPP: Record<string, string> = {
  'Helen Magna': '5511965781940',
  'Miguel Fogaça': '5511932203852',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cronKeyHeader = req.headers.get('x-cron-key') ?? '';
    const { data: cronSecret } = await supabase.rpc('get_equipe_11ds_cron_secret');
    const isCron = !!cronSecret && cronKeyHeader === cronSecret;
    if (!isCron) return json({ ok: false, erro: 'Unauthorized' }, 401);

    const hojeIso = new Date().toISOString().slice(0, 10);

    const { data: leadsVencidos, error } = await supabase
      .from('leads')
      .select('id, nome, vendedor, followup_manual_prazo, followup_manual_tentativas')
      .eq('origem', 'Time Comercial')
      .eq('status', 'followup')
      .lte('followup_manual_prazo', hojeIso)
      .not('vendedor', 'is', null);

    if (error) {
      console.error('time-comercial-followup-alerta: erro ao buscar leads', error);
      return json({ ok: false, erro: 'Erro ao buscar leads vencidos.' }, 500);
    }

    if (!leadsVencidos?.length) {
      return json({ ok: true, vendedoresNotificados: 0, leads: 0 });
    }

    // Agrupa por vendedor -- 1 mensagem só, não 1 por lead (mesmo princípio
    // já usado em enviar-cobranca pra não gerar spam).
    const porVendedor = new Map<string, typeof leadsVencidos>();
    for (const lead of leadsVencidos) {
      const nome = lead.vendedor as string;
      if (!porVendedor.has(nome)) porVendedor.set(nome, []);
      porVendedor.get(nome)!.push(lead);
    }

    let vendedoresNotificados = 0;
    const erros: Array<{ vendedor: string; erro: string }> = [];

    for (const [vendedor, leadsDoVendedor] of porVendedor) {
      const numero = VENDEDOR_WHATSAPP[vendedor];
      if (!numero) {
        erros.push({ vendedor, erro: 'sem número de WhatsApp cadastrado' });
        continue;
      }

      const lista = leadsDoVendedor
        .map((l) => {
          const dias = Math.round(
            (new Date(hojeIso + 'T00:00:00').getTime() - new Date(l.followup_manual_prazo + 'T00:00:00').getTime())
            / (24 * 60 * 60 * 1000),
          );
          const atraso = dias > 0 ? ` (venceu há ${dias}d)` : dias === 0 ? ' (vence hoje)' : '';
          return `• ${l.nome} — tentativa #${l.followup_manual_tentativas ?? 1}${atraso}`;
        })
        .join('\n');

      const mensagem = leadsDoVendedor.length === 1
        ? `⏰ Follow-up vencido!\n\n${lista}\n\nDá uma olhada no CRM e marca o próximo passo.`
        : `⏰ Você tem ${leadsDoVendedor.length} follow-ups vencidos:\n\n${lista}\n\nDá uma olhada no CRM e marca o próximo passo de cada um.`;

      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/wpp-enviar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: JSON.stringify({ numero, mensagem }),
        });
        const resultado = await res.json().catch(() => ({}));
        if (!res.ok || resultado?.ok === false) {
          erros.push({ vendedor, erro: resultado?.error || `wpp-enviar respondeu ${res.status}` });
          continue;
        }
        vendedoresNotificados += 1;
      } catch (e) {
        erros.push({ vendedor, erro: (e as Error).message ?? 'erro desconhecido' });
      }
    }

    return json({ ok: true, vendedoresNotificados, leads: leadsVencidos.length, erros });
  } catch (error) {
    console.error('time-comercial-followup-alerta error:', error);
    return json({ ok: false, erro: 'Erro interno.' }, 500);
  }
});
