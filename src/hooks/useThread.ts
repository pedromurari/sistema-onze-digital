import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Extraido de ChatConversas.tsx: busca a thread de um telefone + subscription
// realtime pra esse telefone. Compartilhado entre a aba completa e o widget
// flutuante. Tambem e' o ponto unico que marca a conversa como lida (upsert em
// chat_leituras) -- os dois lugares que abrem uma thread ganham esse
// comportamento de graca e ficam consistentes entre si.

export interface MensagemRow {
  id: string;
  telefone: string;
  direcao: 'recebida' | 'enviada';
  conteudo: string;
  tipo: string;
  origem: string;
  created_at: string;
  evolution_instance: string | null;
}

async function marcarComoLida(userId: string, telefone: string): Promise<void> {
  try {
    const { error } = await supabase.from('chat_leituras' as any).upsert({
      user_id: userId,
      telefone,
      lida_em: new Date().toISOString(),
    }, { onConflict: 'user_id,telefone' });
    if (error) console.error('marcarComoLida:', error.message);
  } catch (e: unknown) {
    console.error('marcarComoLida falhou:', (e as Error).message);
  }
}

/**
 * `instancias` limita o historico aos numeros informados. Sem ele, a thread
 * traz a conversa inteira daquele telefone, com qualquer numero nosso (o
 * comportamento do Chat completo). Com ele, so o que passou pelos numeros
 * pedidos -- e' o que o Chat do Time Comercial usa pro vendedor nao ler a
 * conversa que outro numero teve com o mesmo lead.
 */
export function useThread(telefone: string | null, instancias?: string | string[], desde?: string) {
  const { user } = useAuth();
  const [thread, setThread] = useState<MensagemRow[]>([]);
  const [loading, setLoading] = useState(false);

  const filtroChave = Array.isArray(instancias) ? [...instancias].sort().join(',') : instancias ?? '';
  const temFiltro = instancias !== undefined;

  const carregarThread = useCallback(async (tel: string) => {
    setLoading(true);
    const lista = temFiltro ? filtroChave.split(',').filter(Boolean) : null;
    if (lista && lista.length === 0) { setThread([]); setLoading(false); return; }

    let query = supabase
      .from('whatsapp_mensagens' as any)
      .select('id, telefone, direcao, conteudo, tipo, origem, created_at, evolution_instance')
      .eq('telefone', tel)
      .order('created_at', { ascending: true });
    if (lista) query = query.in('evolution_instance', lista);
    if (desde) query = query.gte('created_at', desde);

    const { data } = await query;
    setThread((data ?? []) as any as MensagemRow[]);
    setLoading(false);
  }, [temFiltro, filtroChave, desde]);

  useEffect(() => {
    if (!telefone) { setThread([]); return; }
    carregarThread(telefone);
    if (user) marcarComoLida(user.id, telefone);

    const ch = supabase.channel(`whatsapp_mensagens_thread_${telefone}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'whatsapp_mensagens',
        filter: `telefone=eq.${telefone}`,
      }, () => {
        carregarThread(telefone);
        if (user) marcarComoLida(user.id, telefone);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [telefone, user, carregarThread]);

  return { thread, loading };
}
