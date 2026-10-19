import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_TENTATIVAS = 3;

function agoraBrasilia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '00';
  return { data: `${p('year')}-${p('month')}-${p('day')}`, minutos: Number(p('hour')) * 60 + Number(p('minute')) };
}

function renderizar(modelo: string, vars: Record<string, string>) {
  return modelo.replace(/\{\{(\w+)\}\}/g, (_, chave) => vars[chave] ?? '');
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: segredo } = await admin.from('cron_segredos_internos').select('valor').eq('nome', 'aviso_meet').maybeSingle();
  if (!segredo || req.headers.get('x-cron-key') !== segredo.valor) return new Response('forbidden', { status: 403 });

  const { data: config } = await admin.from('aviso_meet_config').select('*').eq('id', 1).single();
  if (!config?.ativo) return Response.json({ ok: true, ativo: false });
  if (!config.instance_name) return Response.json({ ok: false, erro: 'Instância do WhatsApp não configurada.' });

  const { data: evoRows } = await admin.from('evolution_config').select('api_url, api_key').eq('instance_name', config.instance_name).limit(1);
  const evo = evoRows?.[0];
  if (!evo) return Response.json({ ok: false, erro: `Instância ${config.instance_name} não encontrada.` });

  const agora = agoraBrasilia();
  const { data: aulas, error } = await admin
    .from('aulas')
    .select('id, data, horario_inicio, modulo, link_meet, aviso_tentativas, turmas(nome, grupo_whatsapp_jid)')
    .eq('data', agora.data)
    .eq('status', 'agendada')
    .not('link_meet', 'is', null)
    .not('horario_inicio', 'is', null)
    .or('aviso_status.is.null,aviso_status.eq.falhou')
    .lt('aviso_tentativas', MAX_TENTATIVAS);
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });

  const base = (evo.api_url as string).replace(/\/$/, '');
  const url = /^https?:\/\//i.test(base) ? base : `https://${base}`;
  const resultados: { aula_id: string; status: string; erro?: string }[] = [];

  for (const aula of aulas ?? []) {
    const turma = aula.turmas as unknown as { nome: string; grupo_whatsapp_jid: string | null } | null;
    if (!turma?.grupo_whatsapp_jid) continue;

    const inicio = Number(aula.horario_inicio!.slice(0, 2)) * 60 + Number(aula.horario_inicio!.slice(3, 5));
    if (agora.minutos < inicio - config.antecedencia_minutos || agora.minutos >= inicio) continue;

    const texto = renderizar(config.mensagem_modelo, {
      turma: turma.nome.replace(/^Turma #/, 'turma '),
      modulo: aula.modulo ?? 'aula',
      hora: aula.horario_inicio!.slice(0, 5),
      link_meet: aula.link_meet ?? '',
    });

    try {
      const res = await fetch(`${url}/message/sendText/${config.instance_name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evo.api_key as string },
        body: JSON.stringify({ number: turma.grupo_whatsapp_jid, text: texto, delay: 1200 }),
      });
      const corpo = await res.text();
      if (!res.ok) throw new Error(`Evolution ${res.status}: ${corpo.slice(0, 200)}`);
      await admin.from('aulas').update({
        aviso_status: 'enviado', aviso_enviado_em: new Date().toISOString(), aviso_erro: null,
      }).eq('id', aula.id);
      resultados.push({ aula_id: aula.id, status: 'enviado' });
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'Erro desconhecido';
      await admin.from('aulas').update({
        aviso_status: 'falhou', aviso_erro: erro, aviso_tentativas: aula.aviso_tentativas + 1,
      }).eq('id', aula.id);
      resultados.push({ aula_id: aula.id, status: 'falhou', erro });
    }
  }

  return Response.json({ ok: true, ativo: true, processadas: resultados.length, resultados });
});
