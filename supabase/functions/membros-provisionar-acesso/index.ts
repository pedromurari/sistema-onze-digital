import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fase 2 do plano "Unificar sistema + Área de Membros real"
// (C:\Users\pedro\.claude\plans\typed-seeking-wren.md) -- generaliza
// npa-liberar-acesso-membros (que é acionado manualmente por um lead
// específico) pra um cron de varredura: a cada rodada, procura alunos
// REAIS com matrícula ativa num dos produtos piloto que ainda não têm
// acesso à Área de Membros, e libera.
//
// Começa só com 'psicanalise' (Fase 5 -- piloto). NPA e NPS entram depois
// (Fase 6): NPA porque já tem um fluxo manual rodando via Kanban que não
// deve ser duplicado ainda, NPS porque não existe conteúdo (products/
// modules/lessons) na Área de Membros pra numerologia.
const PRODUTO_PARA_SLUG: Record<string, string> = {
  psicanalise: 'formacao-psicanalise',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key',
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const chaveEsperada = await supabase.rpc('get_equipe_11ds_cron_secret').then((r) => r.data as string | null);
  const chaveRecebida = req.headers.get('x-cron-key');
  if (!chaveEsperada || chaveRecebida !== chaveEsperada) {
    return respond(401, { error: 'Unauthorized' });
  }

  const areaMembrosUrl = Deno.env.get('AREA_MEMBROS_URL');
  const areaMembrosKey = Deno.env.get('AREA_MEMBROS_API_KEY');
  if (!areaMembrosUrl || !areaMembrosKey) {
    return respond(500, { error: 'Integração com a Área de Membros não configurada (faltam secrets AREA_MEMBROS_URL/AREA_MEMBROS_API_KEY)' });
  }
  const base = areaMembrosUrl.replace(/\/$/, '');

  const produtosPiloto = Object.keys(PRODUTO_PARA_SLUG);
  const { data: alunos, error: alunosError } = await supabase
    .from('alunos')
    .select('id, pessoa_id, produto, turma_id, pessoas:pessoa_id (nome, email, telefone), turmas:turma_id (nome)')
    .eq('status', 'ativo')
    .in('produto', produtosPiloto)
    .is('acesso_membros_liberado_em', null)
    .limit(25);

  if (alunosError) return respond(500, { error: `Erro ao buscar alunos: ${alunosError.message}` });
  if (!alunos?.length) return respond(200, { processados: 0 });

  let liberados = 0;
  const falhas: { alunoId: string; erro: string }[] = [];

  for (const aluno of alunos as Record<string, unknown>[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pessoa = aluno.pessoas as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turma = aluno.turmas as any;
    const produtoSlug = PRODUTO_PARA_SLUG[aluno.produto as string];

    if (!pessoa?.email || !produtoSlug) {
      falhas.push({ alunoId: aluno.id as string, erro: !pessoa?.email ? 'pessoa sem email' : 'produto sem mapeamento' });
      continue;
    }

    try {
      const resp = await fetch(`${base}/api/liberar-acesso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${areaMembrosKey}` },
        body: JSON.stringify({
          email: pessoa.email,
          nome: pessoa.nome,
          whatsapp: pessoa.telefone ?? undefined,
          produtoSlug,
          turmaCrmId: aluno.turma_id ?? undefined,
          turmaCrmNome: turma?.nome ?? undefined,
          crmPessoaId: aluno.pessoa_id,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await resp.json().catch(() => ({} as Record<string, unknown>));
      if (!resp.ok || !data?.loginUrl) {
        falhas.push({ alunoId: aluno.id as string, erro: (data as { error?: string })?.error || `HTTP ${resp.status}` });
        continue;
      }

      const { error: updateError } = await supabase
        .from('alunos')
        .update({ acesso_membros_url: data.loginUrl as string, acesso_membros_liberado_em: new Date().toISOString() })
        .eq('id', aluno.id as string);
      if (updateError) {
        falhas.push({ alunoId: aluno.id as string, erro: `liberado mas falhou ao salvar: ${updateError.message}` });
        continue;
      }
      liberados += 1;
    } catch (err) {
      falhas.push({ alunoId: aluno.id as string, erro: err instanceof Error ? err.message : 'erro inesperado' });
    }
  }

  return respond(200, { processados: alunos.length, liberados, falhas });
});
