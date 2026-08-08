import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizePhone, sufixo, maskPhone, TIPO_LABEL } from '@/lib/chat-utils';

// Extraido de ChatConversas.tsx: busca as conversas (agrupadas por telefone,
// identidade resolvida por sufixo de 8 digitos contra leads_unificados/
// disparo_leads/disparo_campanhas) + subscription realtime. Compartilhado
// entre a aba completa (ChatConversas.tsx) e o widget flutuante (ChatWidget.tsx)
// pra nao duplicar essa logica de identidade em dois lugares.

export type Categoria = 'lancamento' | 'npa' | 'turma' | 'disparo' | 'numerologo';

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
}

export function useConversas() {
  const { user } = useAuth();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarConversas = useCallback(async () => {
    setLoading(true);

    // Ultimas mensagens; agrupa por telefone no cliente (a lista lateral e um
    // "quem falou por ultimo", nao precisa varrer o historico inteiro).
    const { data: msgs, error } = await supabase
      .from('whatsapp_mensagens' as any)
      .select('telefone, conteudo, tipo, created_at, evolution_instance, direcao')
      .order('created_at', { ascending: false })
      .limit(2000);

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
    const [unificadosRes, disparoRes, campanhasRes, leiturasRes] = await Promise.all([
      supabase.from('leads_unificados' as any).select('origem_tabela, origem_id, origem, nome, telefone, temperatura, criado_em'),
      supabase.from('disparo_leads').select('nome, phone, temperatura, campanha_id'),
      supabase.from('disparo_campanhas').select('id, nome'),
      user ? supabase.from('chat_leituras' as any).select('telefone, lida_em').eq('user_id', user.id) : Promise.resolve({ data: [] as any[] }),
    ]);

    const campanhaNome = new Map<string, string>();
    for (const c of (campanhasRes.data ?? []) as any[]) campanhaNome.set(c.id, c.nome);

    const lidaEmPorTelefone = new Map<string, string>();
    for (const l of (leiturasRes.data ?? []) as any[]) lidaEmPorTelefone.set(l.telefone, l.lida_em);

    const porSufixoUnificado = new Map<string, any>();
    for (const r of (unificadosRes.data ?? []) as any[]) {
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
    for (const r of (disparoRes.data ?? []) as any[]) {
      const s = sufixo(normalizePhone(r.phone));
      if (s && !porSufixoDisparo.has(s)) porSufixoDisparo.set(s, r);
    }

    const lista: Conversa[] = [];
    for (const tel of telefones) {
      const ultima = ultimaPorTelefone.get(tel)!;
      const s = sufixo(tel);
      const u = porSufixoUnificado.get(s);
      const d = porSufixoDisparo.get(s);

      let nome: string;
      let categoria: Categoria;
      let grupoNome: string;
      let temperatura: 'quente' | 'morno' | 'frio';
      let alunoId: string | null = null;

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
      } else {
        // Telefone sem match em lugar nenhum: nunca foi lead nem aluno.
        continue;
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
      });
    }

    lista.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm));
    setConversas(lista);
    setLoading(false);
  }, [user]);

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
