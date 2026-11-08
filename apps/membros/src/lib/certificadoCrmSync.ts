import 'server-only'
import { createSistema11Client } from '@/lib/sistema11'

// ─────────────────────────────────────────────────────────────────────────
// Quando um aluno resgata o certificado em /certificado, tenta casar esse
// lead com o card dele no Kanban do lançamento ATIVO no Sistema Onze Digital
// (Plataforma 11ds — projeto Supabase separado) e marca a flag
// `certificado_gerado`, guardando a fase anterior numa anotação no card.
//
// IMPORTANTE: `lancamento_leads.fase` não é escrito direto — existe um
// trigger (`sync_fase_lancamento_leads`) que recalcula o `fase` sozinho a
// partir de uma cascata de flags boolean (matriculado > follow_up_03/02/01 >
// certificado_gerado > grupo_oferta > no_grupo > Planilha), procurando a
// coluna do Kanban com esse nome. Por isso aqui só marcamos a flag — o
// próprio trigger do CRM move o card pra coluna "Certificado gerado".
//
// Busca o lançamento ativo dinamicamente (status = 'em_andamento', ativo =
// true) em vez de fixar o id da turma — assim continua funcionando nas
// próximas turmas sem precisar mexer no código a cada lançamento.
//
// Falha aqui NUNCA deve impedir o aluno de receber o PDF — por isso todo
// esse fluxo é best-effort, sempre dentro de try/catch no caller.
// ─────────────────────────────────────────────────────────────────────────

function apenasDigitosLocais(raw: string): string {
  const d = raw.replace(/\D/g, '')
  // remove o "55" do DDI quando presente, pra comparar só DDD + número
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d
}

export async function sincronizarCertificadoNoCrm(params: {
  nome: string
  email: string
  telefone: string
}): Promise<void> {
  const emailNorm = params.email.trim().toLowerCase()
  const telefoneNorm = apenasDigitosLocais(params.telefone)

  const sistema11 = createSistema11Client()

  // 1. TODOS os lançamentos ativos (pode haver mais de um ao mesmo tempo:
  // ex. a turma atual ainda gerando certificados + a próxima já aberta).
  const { data: lancamentos, error: lancamentoError } = await sistema11
    .from('lancamentos')
    .select('id, nome')
    .eq('status', 'em_andamento')
    .eq('ativo', true)
    .order('data_live', { ascending: false })

  if (lancamentoError || !lancamentos?.length) {
    console.warn('[certificado-crm-sync] nenhum lançamento ativo encontrado:', lancamentoError?.message)
    return
  }

  let encontrouAlgum = false

  for (const lancamento of lancamentos) {
    // 2. Achar o lead desse lançamento por e-mail OU telefone
    const { data: leads, error: leadsError } = await sistema11
      .from('lancamento_leads')
      .select('id, fase, observacoes, email, whatsapp, certificado_gerado')
      .eq('lancamento_id', lancamento.id)

    if (leadsError || !leads) {
      console.warn(`[certificado-crm-sync] erro ao buscar leads de "${lancamento.nome}":`, leadsError?.message)
      continue
    }

    const lead = leads.find(l => {
      const leadEmail = (l.email ?? '').trim().toLowerCase()
      const leadTelefone = apenasDigitosLocais(l.whatsapp ?? '')
      return (emailNorm && leadEmail === emailNorm) || (telefoneNorm && leadTelefone === telefoneNorm)
    })

    if (!lead) continue
    encontrouAlgum = true

    // Já marcado — nada a fazer nesse lançamento
    if (lead.certificado_gerado) continue

    // 3. Guardar a fase anterior como anotação, e marcar a flag (o trigger
    // do CRM cuida de mover o card com base nela, se o board tiver a coluna)
    const { data: faseAnterior } = lead.fase
      ? await sistema11.from('kanban_colunas').select('nome').eq('id', lead.fase).maybeSingle()
      : { data: null }

    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const notaFaseAnterior = faseAnterior?.nome ?? 'sem fase definida'
    const novaObservacao = `[${timestamp}] Certificado gerado via idmpsi.com.br/certificado — estava em "${notaFaseAnterior}".`
    const observacoesAtualizadas = lead.observacoes ? `${lead.observacoes}\n${novaObservacao}` : novaObservacao

    const { error: updateError } = await sistema11
      .from('lancamento_leads')
      .update({
        certificado_gerado: true,
        observacoes: observacoesAtualizadas,
      })
      .eq('id', lead.id)

    if (updateError) {
      console.error(`[certificado-crm-sync] erro ao marcar certificado_gerado em "${lancamento.nome}":`, updateError.message)
    }
  }

  if (!encontrouAlgum) {
    console.warn(`[certificado-crm-sync] nenhum lead encontrado nos lançamentos ativos pra ${emailNorm || telefoneNorm}`)
  }
}
