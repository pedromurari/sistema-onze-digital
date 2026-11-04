import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Endpoint pro Bot da Empresa (Telegram/n8n) consultar o estado real do RH.
// Protegido por x-bot-key (cron_segredos_internos.bot_rh), nao pelo login do
// sistema -- quem chama e o n8n, nao um usuario navegando.
// So leitura. Nenhuma rota daqui grava nada.

function hojeBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-${p.find(x => x.type === 'day')?.value}`;
}

serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ erro: 'Use POST.' }, { status: 405 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: segredo } = await admin.from('cron_segredos_internos').select('valor').eq('nome', 'bot_rh').maybeSingle();
  if (!segredo || req.headers.get('x-bot-key') !== segredo.valor) return Response.json({ erro: 'Não autorizado.' }, { status: 403 });

  const hoje = hojeBrasil();
  const mesAtual = hoje.slice(0, 7);
  const em7dias = new Date(`${hoje}T12:00:00Z`);
  em7dias.setUTCDate(em7dias.getUTCDate() + 7);

  const [profissionaisResp, pagamentosMesResp, pagamentosSemNotaResp, pendentesResp, aulasResp] = await Promise.all([
    admin.from('profissionais').select('id, nome, funcao, modelo_pagamento, valor_fixo, valor_por_aula, ativo').eq('ativo', true).order('nome'),
    admin.from('profissionais_pagamentos').select('profissional_id, data_pagamento, valor, descricao, nota_fiscal_arquivo_url').gte('data_pagamento', `${mesAtual}-01`),
    admin.from('profissionais_pagamentos').select('profissional_id, data_pagamento, valor, descricao').is('nota_fiscal_arquivo_url', null).order('data_pagamento', { ascending: false }).limit(50),
    admin.from('presencas_pendentes_revisao').select('nome_informado, cpf_informado, motivo, created_at').eq('resolvido', false).order('created_at', { ascending: false }),
    admin.from('aulas').select('data, horario_inicio, modulo, status, link_meet, turmas(nome), profissionais(nome)')
      .gte('data', hoje).lte('data', em7dias.toISOString().slice(0, 10)).order('data').order('horario_inicio'),
  ]);

  const erro = profissionaisResp.error || pagamentosMesResp.error || pagamentosSemNotaResp.error || pendentesResp.error || aulasResp.error;
  if (erro) return Response.json({ erro: erro.message }, { status: 500 });

  const profissionais = profissionaisResp.data ?? [];
  const nomePorId = new Map(profissionais.map(p => [p.id, p.nome]));

  // Previa de folha do mes: so o que e por aula/hibrido -- mesma regra de PreviaFolha.tsx,
  // porem aqui soma os PAGAMENTOS JA LANCADOS no mes (visao de "quanto ja foi pago"),
  // nao uma projecao de aulas dadas; ambas sao uteis, o bot pode perguntar qualquer uma.
  const pagamentosPorProfissional = new Map<string, { total: number; qtd: number; semNota: number }>();
  for (const p of pagamentosMesResp.data ?? []) {
    const atual = pagamentosPorProfissional.get(p.profissional_id!) ?? { total: 0, qtd: 0, semNota: 0 };
    atual.total += Number(p.valor) || 0;
    atual.qtd += 1;
    if (!p.nota_fiscal_arquivo_url) atual.semNota += 1;
    pagamentosPorProfissional.set(p.profissional_id!, atual);
  }

  return Response.json({
    gerado_em: new Date().toISOString(),
    competencia: mesAtual,
    profissionais_ativos: profissionais.map(p => ({
      nome: p.nome, funcao: p.funcao, modelo_pagamento: p.modelo_pagamento,
      valor_fixo: p.valor_fixo, valor_por_aula: p.valor_por_aula,
      pago_no_mes: pagamentosPorProfissional.get(p.id)?.total ?? 0,
      lancamentos_no_mes: pagamentosPorProfissional.get(p.id)?.qtd ?? 0,
    })),
    pagamentos_sem_nota_fiscal: (pagamentosSemNotaResp.data ?? []).map(p => ({
      profissional: nomePorId.get(p.profissional_id!) ?? 'desconhecido',
      data: p.data_pagamento, valor: p.valor, descricao: p.descricao,
    })),
    presencas_pendentes_revisao: pendentesResp.data ?? [],
    aulas_proximos_7_dias: (aulasResp.data ?? []).map((a: Record<string, unknown>) => ({
      data: a.data, horario: a.horario_inicio, modulo: a.modulo, status: a.status,
      turma: (a.turmas as { nome: string } | null)?.nome ?? null,
      profissional: (a.profissionais as { nome: string } | null)?.nome ?? null,
      tem_link_meet: Boolean(a.link_meet),
    })),
  });
});
