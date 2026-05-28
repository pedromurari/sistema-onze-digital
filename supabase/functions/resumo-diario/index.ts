/**
 * resumo-diario
 * Envia um resumo diário via WhatsApp com:
 * - novos leads do dia
 * - matrículas do dia
 * - pagamentos recebidos do dia
 * - total de inadimplentes
 *
 * Chamado por cron externo (cron-job.org) ou manualmente.
 * Body opcional: { dry_run: true } para simular sem enviar.
 *
 * Ativação: settings.resumo_diario_ativo = true + settings.resumo_diario_numero
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronKey     = Deno.env.get('CRON_SECRET_KEY') ?? '';

    // Validação do cron-key (para chamadas externas do cron-job.org)
    const reqCronKey = req.headers.get('x-cron-key') ?? '';
    if (req.method === 'POST' && cronKey && reqCronKey !== cronKey) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // ── Verificar se resumo diário está ativo ─────────────────────────────────
    const { data: settings } = await sb
      .from('settings')
      .select('resumo_diario_ativo, resumo_diario_numero')
      .maybeSingle();

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body?.dry_run === true;

    if (!settings?.resumo_diario_ativo && !dryRun) {
      return new Response(JSON.stringify({ ok: false, reason: 'Resumo diário desativado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const numero = body?.numero ?? settings?.resumo_diario_numero ?? '';
    if (!numero && !dryRun) {
      return new Response(JSON.stringify({ error: 'Número de destino não configurado' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Coletar dados do dia ──────────────────────────────────────────────────
    const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const [
      { count: novosLeads },
      { count: matriculasHoje },
      { data: pagamentosHoje },
      { count: inadimplentes },
    ] = await Promise.all([
      sb.from('lancamento_leads').select('id', { count: 'exact', head: true })
        .gte('created_at', `${hoje}T00:00:00Z`)
        .lte('created_at', `${hoje}T23:59:59Z`),

      sb.from('alunos').select('id', { count: 'exact', head: true })
        .eq('data_matricula', hoje),

      sb.from('pagamentos').select('valor')
        .eq('data_pagamento', hoje)
        .eq('status', 'pago'),

      sb.from('pagamentos').select('id', { count: 'exact', head: true })
        .lte('data_vencimento', hoje)
        .neq('status', 'pago'),
    ]);

    const totalRecebido = (pagamentosHoje ?? []).reduce(
      (sum: number, p: { valor: number | null }) => sum + Number(p.valor ?? 0),
      0,
    );
    const pagamentosCount = pagamentosHoje?.length ?? 0;

    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const hojeFormatado = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const mensagem = [
      `📊 *Resumo Diário — ${hojeFormatado}*`,
      '',
      `👥 *Novos leads hoje:* ${novosLeads ?? 0}`,
      `🎓 *Matrículas hoje:* ${matriculasHoje ?? 0}`,
      `💰 *Pagamentos recebidos:* ${pagamentosCount} (R$ ${fmt(totalRecebido)})`,
      `⚠️ *Inadimplentes:* ${inadimplentes ?? 0}`,
      '',
      `_Sistema 11ds — ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}_`,
    ].join('\n');

    const resumo = {
      novos_leads:      novosLeads ?? 0,
      matriculas:       matriculasHoje ?? 0,
      pagamentos_count: pagamentosCount,
      total_recebido:   totalRecebido,
      inadimplentes:    inadimplentes ?? 0,
      mensagem,
    };

    if (dryRun) {
      return new Response(JSON.stringify({ dry_run: true, ...resumo }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Enviar WPP ────────────────────────────────────────────────────────────
    const { error: wppErr } = await sb.functions.invoke('wpp-enviar', {
      body: { numero, mensagem },
    });

    if (wppErr) {
      return new Response(JSON.stringify({ error: 'Erro ao enviar WPP: ' + wppErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, enviado_para: numero, ...resumo }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('resumo-diario error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
