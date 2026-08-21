import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePhone, sufixo, maskPhone, TIPO_LABEL, instanciaOcultaNoChat } from '@/lib/chat-utils';

// Extraido de ChatConversas.tsx: busca as conversas (agrupadas por telefone,
// identidade resolvida por sufixo de 8 digitos contra leads_unificados/
// disparo_leads/disparo_campanhas) + subscription realtime. Compartilhado
// entre a aba completa (ChatConversas.tsx) e o widget flutuante (ChatWidget.tsx)
// pra nao duplicar essa logica de identidade em dois lugares.

export type Categoria = 'lancamento' | 'npa' | 'turma' | 'disparo' | 'numerologo' | 'direto';

// O PostgREST corta qualquer select em 1000 linhas. leads_unificados tem ~13k e
// disparo_leads ~4k, entao buscar a tabela inteira pra resolver nome trazia so um
// pedaco -- e a maioria das conversas aparecia como telefone mascarado. Aqui a
// busca e' pelo avesso: parte dos telefones que estao na lista e pede so esses,
// em lotes, casando pelo sufixo de 8 digitos (o formato gravado varia entre as
// fontes, entao `like` no fim do numero e' o que casa).
const LOTE_SUFIXOS = 60;

async function buscarPorSufixo<T>(
  tabela: string, colunas: string, colunaTelefone: string, sufixos: string[],
): Promise<T[]> {
  const achados: T[] = [];
  for (let i = 0; i < sufixos.length; i += LOTE_SUFIXOS) {
    const filtro = sufixos.slice(i, i + LOTE_SUFIXOS).map(s => `${colunaTelefone}.like.*${s}`).join(',');
    const { data } = await supabase.from(tabela as any).select(colunas).or(filtro);
    if (data) achados.push(...(data as T[]));
  }
  return achados;
}

export interface Conversa {
  telefone: string;
  nome: string;
  categoria: Categoria;
  grupoNome: string;           // turma / lançamento / evento NPA / campanha de disparo / "Numerólogo"
  temperatura: 'quente' | 'morno' | 'frio';
  alunoId: string | null;
  ultimaMensagem: string;
  ultimaEm: string;
  ultimaInstancia: string | null; // qual numero/instancia do WhatsApp mandou/recebeu a ultima mensagem
  ultimaDirecao: 'recebida' | 'enviada';
  naoLida: boolean; // ultima mensagem recebida e mais recente que a leitura do usuario atual
  disparoRespondeu: boolean; // so relevante quando categoria === 'disparo': lead ja respondeu a campanha?
}

/**
 * `instancias` restringe a lista aos numeros informados (nomes de instancia da
 * Evolution). Sem ele, comportamento de sempre: todas as conversas, menos as
 * das instancias pessoais escondidas. Com ele, o filtro e' explicito e vale
 * mais que a lista de ocultas -- quem pede um numero especifico quer aquele
 * numero. Usado pelo Chat do Time Comercial, onde o vendedor so pode ver o que
 * passou pelo WhatsApp dele.
 */
export function useConversas(instancias?: string | string[], desde?: string) {
  const { user } = useAuth();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);

  // Chave estavel pro useCallback: array novo a cada render nao pode reiniciar a busca.
  const filtroChave = Array.isArray(instancias) ? [...instancias].sort().join(',') : instancias ?? '';
  const temFiltro = instancias !== undefined;

  const carregarConversas = useCallback(async () => {
    setLoading(true);
    const instanciasFiltro = temFiltro ? filtroChave.split(',').filter(Boolean) : null;

    // Filtro pedido, mas nenhum numero atras dele (ex: vendedor sem instancia
    // cadastrada): nao ha o que mostrar -- e buscar sem filtro vazaria as
    // conversas de todo mundo.
    if (instanciasFiltro && instanciasFiltro.length === 0) { setConversas([]); setLoading(false); return; }

    // Ultimas mensagens; agrupa por telefone no cliente (a lista lateral e um
    // "quem falou por ultimo", nao precisa varrer o historico inteiro).
    let query = supabase
      .from('whatsapp_mensagens' as any)
      .select('telefone, conteudo, tipo, created_at, evolution_instance, direcao')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (instanciasFiltro) query = query.in('evolution_instance', instanciasFiltro);
    if (desde) query = query.gte('created_at', desde);

    const { data: msgs, error } = await query;

    if (error) { setLoading(false); return; }

    const ultimaPorTelefone = new Map<string, { conteudo: string; tipo: string; created_at: string; evolution_instance: string | null; direcao: 'recebida' | 'enviada' }>();
    for (const m of (msgs ?? []) as any[]) {
      if (!ultimaPorTelefone.has(m.telefone)) {
        ultimaPorTelefone.set(m.telefone, {
          conteudo: m.conteudo, tipo: m.tipo, created_at: m.created_at,
          evolution_instance: m.evolution_instance ?? null, direcao: m.direcao,
        });
      }
    }
    const telefones = [...ultimaPorTelefone.keys()];
    if (!telefones.length) { setConversas([]); setLoading(false); return; }

    // Identidade: leads_unificados primeiro (ja traz a origem legivel: qual
    // lancamento, evento NPA ou turma), disparo_leads como fallback (leads de
    // CSV/grupo de WhatsApp so existem la, sem linha em leads_unificados) --
    // usa o nome da campanha de disparo como grupo nesse caso. Casamento por
    // sufixo de 8 digitos, igual ao evo-resposta -- o formato gravado varia
    // entre as fontes.
    const sufixos = [...new Set(telefones.map(sufixo).filter(Boolean))];

    const [unificados, disparos, campanhasRes, leiturasRes] = await Promise.all([
      buscarPorSufixo<any>('leads_unificados', 'origem_tabela, origem_id, origem, nome, telefone, temperatura, criado_em', 'telefone', sufixos),
      buscarPorSufixo<any>('disparo_leads', 'nome, phone, temperatura, campanha_id, respondeu_em', 'phone', sufixos),
      supabase.from('disparo_campanhas').select('id, nome'),
      user ? supabase.from('chat_leituras' as any).select('telefone, lida_em').eq('user_id', user.id) : Promise.resolve({ data: [] as any[] }),
    ]);

    const campanhaNome = new Map<string, string>();
    for (const c of (campanhasRes.data ?? []) as any[]) campanhaNome.set(c.id, c.nome);

    const lidaEmPorTelefone = new Map<string, string>();
    for (const l of (leiturasRes.data ?? []) as any[]) lidaEmPorTelefone.set(l.telefone, l.lida_em);

    const porSufixoUnificado = new Map<string, any>();
    for (const r of unificados) {
      const s = sufixo(normalizePhone(r.telefone));
      if (!s) continue;
      const atual = porSufixoUnificado.get(s);
      // aluno ganha de lead; empate resolve pelo mais recente
      const ganha = !atual
        || (r.origem_tabela === 'alunos' && atual.origem_tabela !== 'alunos')
        || (r.origem_tabela === 'alunos' === (atual.origem_tabela === 'alunos')
            && String(r.criado_em ?? '') > String(atual.criado_em ?? ''));
      if (ganha) porSufixoUnificado.set(s, r);
    }

    const porSufixoDisparo = new Map<string, any>();
    for (const r of disparos) {
      const s = sufixo(normalizePhone(r.phone));
      if (s && !porSufixoDisparo.has(s)) porSufixoDisparo.set(s, r);
    }

    const lista: Conversa[] = [];
    for (const tel of telefones) {
      const ultima = ultimaPorTelefone.get(tel)!;
      // Numero pessoal (ex: "ig") nao e canal de atendimento -- a conversa toda
      // some do Chat quando a mensagem mais recente veio/foi por essa instancia.
      // Nao vale quando o chamador pediu instancias especificas.
      if (!instanciasFiltro && instanciaOcultaNoChat(ultima.evolution_instance)) continue;
      const s = sufixo(tel);
      const u = porSufixoUnificado.get(s);
      const d = porSufixoDisparo.get(s);

      let nome: string;
      let categoria: Categoria;
      let grupoNome: string;
      let temperatura: 'quente' | 'morno' | 'frio';
      let alunoId: string | null = null;
      let disparoRespondeu = false;

      if (u) {
        nome = u.nome || maskPhone(tel);
        temperatura = u.temperatura;
        const origem = String(u.origem ?? '');
        if (u.origem_tabela === 'alunos') {
          categoria = 'turma'; alunoId = u.origem_id;
          grupoNome = origem.replace(/^Aluno:\s*/, '') || 'Sem turma';
        } else if (u.origem_tabela === 'lancamento_leads') {
          categoria = 'lancamento';
          grupoNome = origem.replace(/^Lançamento:\s*/, '') || '(sem lançamento)';
        } else if (u.origem_tabela === 'npa_evento_leads') {
          categoria = 'npa';
          grupoNome = origem.replace(/^Evento NPA:\s*/, '') || '(sem evento)';
        } else {
          categoria = 'numerologo';
          grupoNome = 'Numerólogo';
        }
      } else if (d) {
        nome = d.nome || maskPhone(tel);
        temperatura = d.temperatura;
        categoria = 'disparo';
        grupoNome = campanhaNome.get(d.campanha_id) ?? '(campanha removida)';
        disparoRespondeu = !!d.respondeu_em;
      } else {
        // Telefone sem match em lancamento_leads/npa_evento_leads/alunos/disparo_leads --
        // ex: lead que clicou num anuncio "click-to-WhatsApp" e mandou a mensagem
        // automatica antes de qualquer cadastro nosso existir pra esse numero. Antes
        // isso era descartado (continue) e a mensagem nunca aparecia no Chat, mesmo
        // gravada em whatsapp_mensagens -- agora entra como categoria avulsa "direto"
        // pra nao sumir.
        nome = maskPhone(tel);
        temperatura = 'quente';
        categoria = 'direto';
        grupoNome = 'Contato direto (sem cadastro)';
      }

      const lidaEm = lidaEmPorTelefone.get(tel);
      const naoLida = ultima.direcao === 'recebida' && (!lidaEm || ultima.created_at > lidaEm);

      lista.push({
        telefone: tel, nome, categoria, grupoNome, temperatura, alunoId,
        ultimaMensagem: ultima.tipo !== 'text' ? `[${TIPO_LABEL[ultima.tipo] ?? 'Mensagem'}]` : ultima.conteudo,
        ultimaEm: ultima.created_at,
        ultimaInstancia: ultima.evolution_instance,
        ultimaDirecao: ultima.direcao,
        naoLida,
        disparoRespondeu,
      });
    }

    lista.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm));
    setConversas(lista);
    setLoading(false);
  }, [user, temFiltro, filtroChave, desde]);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  // Mensagem nova em qualquer conversa reordena a lista lateral.
  useEffect(() => {
    const ch = supabase.channel('whatsapp_mensagens_lista')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens' }, () => carregarConversas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregarConversas]);

  return { conversas, loading };
}
