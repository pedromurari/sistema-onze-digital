import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchConnectionState, type ConnState, type EvolutionInstance } from '@/lib/evolution-status';
import { COLUNAS_EVOLUTION_VISIVEIS } from '@/lib/evolution';

const POLL_MS = 30_000;

export function useEvolutionStatus() {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [loading, setLoading] = useState(true);

  const checkAll = useCallback(async (list: EvolutionInstance[]) => {
    setStates(prev => Object.fromEntries(list.map(i => [i.id, prev[i.id] ?? 'loading'])));
    const results = await Promise.all(list.map(async i => ({ id: i.id, state: await fetchConnectionState(i) })));
    setStates(Object.fromEntries(results.map(r => [r.id, r.state])));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Nao usar select('*'): a leitura de `api_key` foi revogada e o '*' derrubaria a
    // consulta inteira — o Chat ficaria sem instancia nenhuma na lista.
    const { data, error } = await supabase
      .from('evolution_config')
      .select(COLUNAS_EVOLUTION_VISIVEIS)
      .order('instance_name');
    const list = !error && data ? (data as EvolutionInstance[]) : [];
    setInstances(list);
    setLoading(false);
    if (list.length) await checkAll(list);
  }, [checkAll]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => { if (instances.length) checkAll(instances); }, POLL_MS);
    return () => clearInterval(id);
  }, [instances, checkAll]);

  return { instances, states, loading, refresh };
}
