/**
 * campanha-massa-email-cron
 * Roda a cada 2 minutos (pg_cron). Pega ate 25 destinatarios pendentes de
 * email de campanhas_massa com status 'enviando', manda via email-enviar
 * (usa o provider ativo em email_config -- hoje Resend) e marca o
 * resultado. Atualiza o contador da campanha; quando nao sobra mais
 * pendente nem whatsapp em andamento, marca a campanha como concluida.
 *
 * CTA rastreado: se campanha.email_link_cta estiver preenchido, o link
 * final vira um redirect por campanha-massa-click (registra o clique em
 * campanhas_massa_destinatarios antes de mandar pro destino real). Usa o
 * placeholder {{link_cta}} dentro de email_corpo quando presente; senao
 * acrescenta um paragrafo com o link no fim. Campanhas antigas que so tem
 * o link_cta "cru" (sem rastreio) continuam funcionando como antes.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'webinario-internal-2026';
const LOTE = 25;

function aplicarTemplate(texto: string, nome: string): string {
  return texto.replace(/\{\{\s*nome\s*\}\}/gi, nome.split(' ')[0] || nome);
}

function linkRastreado(destinatarioId: string, urlDestino: string): string {
  const base = Deno.env.get('SUPABASE_URL')!;
  return `${base}/functions/v1/campanha-massa-click?d=${encodeURIComponent(destinatarioId)}&u=${encodeURIComponent(urlDestino)}`;
}

serve(async (req) => {
  const cronKey = req.headers.get('x-cron-key');
  if (cronKey !== CRON_SECRET) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: pendentes, error: errPend } = await supabase
    .from('campanhas_massa_destinatarios')
    .select('id, campanha_id, nome, email')
    .eq('status_email', 'pendente')
    .limit(LOTE);

  if (errPend) return new Response(JSON.stringify({ ok: false, erro: errPend.message }), { status: 500 });
  if (!pendentes?.length) return new Response(JSON.stringify({ ok: true, enviados: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const campanhaIds = [...new Set(pendentes.map((p) => p.campanha_id))];
  const { data: campanhas } = await supabase.from('campanhas_massa').select('id, nome, email_assunto, email_corpo, link_cta, email_link_cta, status').in('id', campanhaIds);
  const campanhaPorId = new Map((campanhas ?? []).map((c) => [c.id, c]));

  let enviados = 0;
  let erros = 0;
  let bloqueadoPorCota = false;

  for (const dest of pendentes) {
    const campanha = campanhaPorId.get(dest.campanha_id);
    // Sem e-mail e um fato definitivo; campanha pausada e um estado temporario
    // -- marcar 'erro' nesse caso queimava o destinatario pra sempre e ele
    // nunca mais sairia quando a campanha voltasse.
    if (!dest.email) {
      await supabase.from('campanhas_massa_destinatarios').update({ status_email: 'sem_email' }).eq('id', dest.id);
      continue;
    }
    if (!campanha || campanha.status !== 'enviando') continue;

    const assunto = aplicarTemplate(campanha.email_assunto ?? '', dest.nome ?? '');
    let corpo = aplicarTemplate(campanha.email_corpo ?? '', dest.nome ?? '');
    if (campanha.email_link_cta) {
      const urlRastreada = linkRastreado(dest.id, campanha.email_link_cta);
      corpo = corpo.includes('{{link_cta}}')
        ? corpo.replaceAll('{{link_cta}}', urlRastreada)
        : `${corpo}<p><a href="${urlRastreada}">${campanha.email_link_cta}</a></p>`;
    } else if (campanha.link_cta && !corpo.includes(campanha.link_cta)) {
      corpo += `<p><a href="${campanha.link_cta}">${campanha.link_cta}</a></p>`;
    }

    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/email-enviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: JSON.stringify({
          to: dest.email, to_name: dest.nome, subject: assunto, html: corpo,
          // identifica a origem pro rastreio de abertura (email_envios)
          origem: 'campanha_massa', referencia_id: dest.id,
        }),
      });
      // A email-enviar responde HTTP 200 mesmo quando o provedor recusa: o
      // erro de verdade vem em `ok: false` no corpo. Sem olhar o corpo, falha
      // de entrega era gravada como 'enviado' -- foi assim que 183 e-mails
      // recusados por cota apareceram no painel como enviados em 22/11/2026.
      const bruto = await res.text();
      if (!res.ok) throw new Error(`email-enviar ${res.status}: ${bruto.slice(0, 200)}`);
      let corpoResp: { ok?: boolean; error?: string } = {};
      try { corpoResp = JSON.parse(bruto); } catch { /* resposta sem json */ }
      if (corpoResp.ok === false) throw new Error(corpoResp.error ?? 'falha no envio');

      await supabase.from('campanhas_massa_destinatarios').update({ status_email: 'enviado', enviado_email_em: new Date().toISOString() }).eq('id', dest.id);
      enviados++;
    } catch (e) {
      const msg = (e as Error).message;
      // Cota/limite do provedor nao e culpa do destinatario: ele continua
      // 'pendente' e sai sozinho quando a cota virar. E nao adianta tentar o
      // resto do lote -- vai falhar igual e so gasta chamada.
      if (/daily_quota_exceeded|rate_limit|429|too many requests/i.test(msg)) {
        await supabase.from('campanhas_massa_destinatarios')
          .update({ erro_msg: `aguardando cota do provedor: ${msg.slice(0, 200)}` })
          .eq('id', dest.id);
        console.warn('campanha-massa-email-cron: cota do provedor estourada, parando o lote');
        bloqueadoPorCota = true;
        break;
      }
      await supabase.from('campanhas_massa_destinatarios').update({ status_email: 'erro', erro_msg: msg.slice(0, 300) }).eq('id', dest.id);
      erros++;
    }
  }

  // Atualiza contadores + fecha campanha quando nao sobra mais nada pendente.
  for (const campanhaId of campanhaIds) {
    const { count: aindaPendente } = await supabase.from('campanhas_massa_destinatarios').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).eq('status_email', 'pendente');
    const { count: totalEnviado } = await supabase.from('campanhas_massa_destinatarios').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).eq('status_email', 'enviado');
    const { count: totalErro } = await supabase.from('campanhas_massa_destinatarios').select('id', { count: 'exact', head: true }).eq('campanha_id', campanhaId).eq('status_email', 'erro');
    await supabase.from('campanhas_massa').update({ total_enviados_email: totalEnviado ?? 0, total_erro_email: totalErro ?? 0 }).eq('id', campanhaId);

    if (!aindaPendente) {
      const campanha = campanhaPorId.get(campanhaId);
      if (campanha?.status === 'enviando') {
        const { data: campDisparo } = await supabase.from('campanhas_massa').select('canal, disparo_campanha_id').eq('id', campanhaId).maybeSingle();
        let whatsappConcluido = true;
        if (campDisparo?.canal !== 'email' && campDisparo?.disparo_campanha_id) {
          const { data: dc } = await supabase.from('disparo_campanhas').select('status').eq('id', campDisparo.disparo_campanha_id).maybeSingle();
          whatsappConcluido = dc?.status === 'concluido' || dc?.status === 'erro';
        }
        if (whatsappConcluido) {
          await supabase.from('campanhas_massa').update({ status: 'concluida' }).eq('id', campanhaId);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados, erros, bloqueadoPorCota }), { headers: { 'Content-Type': 'application/json' } });
});
