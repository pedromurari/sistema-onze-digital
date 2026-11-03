/**
 * campanha-massa-disparar
 * Resolve o publico de uma campanha de disparo em massa (campanhas_massa)
 * a partir da fonte escolhida (lancamento_turma | leads_produto |
 * base_completa | alunos), deduplica por telefone, grava o snapshot em
 * campanhas_massa_destinatarios e, se o canal incluir WhatsApp, reaproveita
 * o motor ja existente (disparo_campanhas/disparo_leads/disparo-runner) --
 * mesma rotacao de instancia, limite diario e respeito a opt-out que ja
 * roda pra Semana do Despertar. Email fica pendente pro
 * campanha-massa-email-cron processar.
 *
 * fonte='alunos': publico de ENGAJAMENTO (novo post/video, pesquisa Divã
 * IDM etc.), nao so venda. filtro: { status?: string[] (default
 * ['ativo']), excluir_diva_leads?: boolean } -- excluir_diva_leads tira
 * quem ja tem um lead com canal='Divã' (ja foi abordado/ja demonstrou
 * interesse), pra focar quem ainda nao foi perguntado.
 *
 * fonte='leads_produto': filtro.excluir_status (string[], opcional) tira
 * quem ja esta num status terminal (ex: 'fechado' -- ja matriculou), pra
 * nao ofertar de novo pra quem ja comprou.
 *
 * Body: { campanhaId: string, apenasContar?: boolean }
 * Com apenasContar=true, so resolve e deduplica pra devolver o total --
 * nao grava nada, nao dispara nada. Usado na pre-visualizacao antes do
 * disparo de verdade.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candidato { pessoa_id: string | null; nome: string; telefone: string | null; email: string | null; }

function normalizarTelefone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 13 && d.startsWith('55')) return d;
  if (d.length === 12 && d.startsWith('55')) return d;
  if (d.length === 11) return `55${d}`;
  if (d.length === 10) return `55${d}`;
  return d;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { campanhaId, apenasContar } = await req.json();
    if (!campanhaId) return json({ ok: false, erro: 'campanhaId obrigatorio' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: campanha, error: errCamp } = await supabase.from('campanhas_massa').select('*').eq('id', campanhaId).maybeSingle();
    if (errCamp || !campanha) return json({ ok: false, erro: 'campanha nao encontrada' }, 404);
    if (!apenasContar && (campanha.status === 'enviando' || campanha.status === 'concluida')) {
      return json({ ok: false, erro: 'campanha ja foi disparada' }, 400);
    }

    const filtro = campanha.fonte_filtro ?? {};
    let candidatos: Candidato[] = [];

    if (campanha.fonte === 'lancamento_turma') {
      const ids: string[] = filtro.lancamento_ids ?? [];
      if (!ids.length) return json({ ok: false, erro: 'selecione pelo menos uma turma' }, 400);
      const { data, error } = await supabase.from('lancamento_leads').select('pessoa_id, nome, whatsapp, email, matriculado').in('lancamento_id', ids);
      if (error) return json({ ok: false, erro: error.message }, 500);
      candidatos = (data ?? [])
        .filter((r: { matriculado: boolean | null }) => !(filtro.excluir_matriculados && r.matriculado))
        .map((r: { pessoa_id: string | null; nome: string; whatsapp: string | null; email: string | null }) => ({
          pessoa_id: r.pessoa_id, nome: r.nome, telefone: r.whatsapp, email: r.email,
        }));
    } else if (campanha.fonte === 'leads_produto') {
      let query = supabase.from('leads').select('pessoa_id, nome, whatsapp, telefone, email, produto, canal, status, criado_em');
      if (filtro.produto) query = query.eq('produto', filtro.produto);
      if (filtro.canal) query = query.eq('canal', filtro.canal);
      if (filtro.status) query = query.eq('status', filtro.status);
      if (filtro.desde) query = query.gte('criado_em', filtro.desde);
      if (filtro.excluir_status?.length) query = query.not('status', 'in', `(${filtro.excluir_status.join(',')})`);
      const { data, error } = await query;
      if (error) return json({ ok: false, erro: error.message }, 500);
      candidatos = (data ?? []).map((r: { pessoa_id: string | null; nome: string; whatsapp: string | null; telefone: string | null; email: string | null }) => ({
        pessoa_id: r.pessoa_id, nome: r.nome, telefone: r.whatsapp || r.telefone, email: r.email,
      }));
    } else if (campanha.fonte === 'base_completa') {
      let query = supabase.from('pessoas').select('id, nome, telefone, email');
      if (filtro.desde) query = query.gte('criado_em', filtro.desde);
      const { data, error } = await query;
      if (error) return json({ ok: false, erro: error.message }, 500);
      candidatos = (data ?? []).map((r: { id: string; nome: string; telefone: string | null; email: string | null }) => ({
        pessoa_id: r.id, nome: r.nome, telefone: r.telefone, email: r.email,
      }));
    } else if (campanha.fonte === 'alunos') {
      const statusAlvo: string[] = filtro.status?.length ? filtro.status : ['ativo'];
      let query = supabase.from('alunos').select('pessoa_id, nome, whatsapp, email, turma_id, status').in('status', statusAlvo);
      if (filtro.turma_ids?.length) query = query.in('turma_id', filtro.turma_ids);
      const { data, error } = await query;
      if (error) return json({ ok: false, erro: error.message }, 500);
      let alunos = (data ?? []).map((r: { pessoa_id: string | null; nome: string; whatsapp: string | null; email: string | null }) => ({
        pessoa_id: r.pessoa_id, nome: r.nome, telefone: r.whatsapp, email: r.email,
      }));
      if (filtro.excluir_diva_leads) {
        const pessoaIds = alunos.map((a) => a.pessoa_id).filter(Boolean) as string[];
        if (pessoaIds.length) {
          const { data: jaDiva } = await supabase.from('leads').select('pessoa_id').eq('canal', 'Divã').in('pessoa_id', pessoaIds);
          const excluidos = new Set((jaDiva ?? []).map((l: { pessoa_id: string }) => l.pessoa_id));
          alunos = alunos.filter((a) => !a.pessoa_id || !excluidos.has(a.pessoa_id));
        }
      }
      candidatos = alunos;
    } else {
      return json({ ok: false, erro: 'fonte invalida' }, 400);
    }

    // Dedup por telefone normalizado (fallback: email) -- mantem o primeiro nome encontrado.
    const porChave = new Map<string, Candidato & { telefoneNorm: string | null }>();
    for (const c of candidatos) {
      const telefoneNorm = normalizarTelefone(c.telefone);
      const chave = telefoneNorm ?? (c.email ? `email:${c.email.toLowerCase()}` : null);
      if (!chave) continue;
      if (!porChave.has(chave)) porChave.set(chave, { ...c, telefoneNorm });
    }
    const unicos = Array.from(porChave.values());

    if (apenasContar) {
      const comTelefone = unicos.filter((c) => c.telefoneNorm).length;
      const comEmail = unicos.filter((c) => c.email).length;
      return json({ ok: true, total: unicos.length, comTelefone, comEmail });
    }

    if (!unicos.length) {
      return json({ ok: false, erro: 'nenhum destinatario com telefone ou email encontrado nesse filtro' }, 400);
    }

    const destinatarios = unicos.map((c) => ({
      campanha_id: campanhaId,
      pessoa_id: c.pessoa_id,
      nome: c.nome,
      telefone: c.telefoneNorm,
      email: c.email,
      status_email: campanha.canal === 'whatsapp' ? 'nao_aplicavel' : (c.email ? 'pendente' : 'sem_email'),
    }));
    const { error: errDest } = await supabase.from('campanhas_massa_destinatarios').insert(destinatarios);
    if (errDest) return json({ ok: false, erro: errDest.message }, 500);

    let disparoCampanhaId: string | null = null;

    if (campanha.canal === 'whatsapp' || campanha.canal === 'ambos') {
      const comTelefone = unicos.filter((c) => c.telefoneNorm);
      if (comTelefone.length) {
        let template = (campanha.texto_whatsapp ?? '').trim();
        if (campanha.link_cta && !template.includes(campanha.link_cta)) {
          template = `${template}\n\n👉 ${campanha.link_cta}`;
        }

        const { data: disparoCamp, error: errDisparoCamp } = await supabase.from('disparo_campanhas').insert({
          nome: campanha.nome,
          descricao: `Disparo em massa -- gerado em ${new Date().toISOString()}`,
          template,
          status: 'ativo',
          leads_total: comTelefone.length,
          delay_min_s: 20,
          delay_max_s: 60,
          daily_limit: campanha.daily_limit ?? 400,
          safe_hour_start: 9,
          safe_hour_end: 20,
          max_errors_seq: 8,
          message_type: 'text',
          next_send_at: new Date().toISOString(),
          ...(campanha.evolution_config_ids?.length ? { evolution_config_ids: campanha.evolution_config_ids } : {}),
        }).select('id').single();
        if (errDisparoCamp || !disparoCamp) return json({ ok: false, erro: errDisparoCamp?.message ?? 'falha ao criar disparo' }, 500);
        disparoCampanhaId = disparoCamp.id;

        const agoraS = Math.floor(Date.now() / 1000);
        const disparoLeadsPayload = comTelefone.map((c, i) => ({
          campanha_id: disparoCampanhaId,
          nome: c.nome,
          phone: c.telefoneNorm,
          email: c.email,
          pessoa_id: c.pessoa_id,
          status: 'pendente',
          ordem: agoraS + i,
        }));
        const { error: errLeads } = await supabase.from('disparo_leads').insert(disparoLeadsPayload);
        if (errLeads) return json({ ok: false, erro: errLeads.message }, 500);
      }
    }

    await supabase.from('campanhas_massa').update({
      status: 'enviando',
      total_destinatarios: unicos.length,
      disparo_campanha_id: disparoCampanhaId,
      enviado_em: new Date().toISOString(),
    }).eq('id', campanhaId);

    return json({ ok: true, totalDestinatarios: unicos.length, disparoCampanhaId });
  } catch (e) {
    console.error('campanha-massa-disparar:', e);
    return json({ ok: false, erro: (e as Error).message }, 500);
  }
});
