import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, X, ChevronUp, ChevronDown } from 'lucide-react';

interface EvInstance { id: string; instance_name: string; ativo: boolean; }

export type EvolutionTask = 'cobranca' | 'funil' | 'disparo' | 'boas_vindas';

interface Props {
  task: EvolutionTask;
  label: string; // "Cobrança", "Funil", "Disparo"
}

export function EvolutionTaskPanel({ task, label }: Props) {
  const [allInstances, setAllInstances] = useState<EvInstance[]>([]);
  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [dirty,        setDirty]        = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [instRes, taskRes] = await Promise.all([
      supabase.from('evolution_config' as any)
        .select('id, instance_name, ativo')
        .order('prioridade', { ascending: true }),
      (supabase as any).from('evolution_task_config')
        .select('instance_ids')
        .eq('task', task)
        .maybeSingle(),
    ]);
    if (instRes.data) setAllInstances(instRes.data as EvInstance[]);
    setSelectedIds((taskRes.data as any)?.instance_ids ?? []);
    setLoading(false);
    setDirty(false);
  }, [task]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    await (supabase as any).from('evolution_task_config').upsert(
      { task, instance_ids: selectedIds, updated_at: new Date().toISOString() },
      { onConflict: 'task' },
    );
    setSaving(false);
    setDirty(false);
    toast.success(`Instâncias de ${label} salvas!`);
  };

  const update = (ids: string[]) => { setSelectedIds(ids); setDirty(true); };

  const addInstance  = (id: string) => update([...selectedIds, id]);
  const removeInstance = (id: string) => update(selectedIds.filter(i => i !== id));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const n = [...selectedIds];
    [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
    update(n);
  };

  const moveDown = (idx: number) => {
    if (idx >= selectedIds.length - 1) return;
    const n = [...selectedIds];
    [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
    update(n);
  };

  const activeInstances    = allInstances.filter(i => i.ativo);
  const selectedInstances  = selectedIds.map(id => allInstances.find(i => i.id === id)).filter(Boolean) as EvInstance[];
  const availableToAdd     = activeInstances.filter(i => !selectedIds.includes(i.id));

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando instâncias...
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          WhatsApp — {label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedInstances.length === 0
            ? 'Sem seleção — usa todas as instâncias ativas por prioridade global'
            : `${selectedInstances.length} instância${selectedInstances.length > 1 ? 's' : ''} · ${selectedInstances[0].instance_name} (primária)${selectedInstances.length > 1 ? ` + ${selectedInstances.length - 1} backup${selectedInstances.length > 2 ? 's' : ''}` : ''}`}
        </p>
      </div>

      {allInstances.length === 0 ? (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
          Nenhuma instância cadastrada. Configure em <strong>Configurações → WhatsApp</strong>.
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {selectedInstances.map((inst, idx) => (
              <div key={inst.id} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
                <div className="flex flex-col gap-0 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === selectedInstances.length - 1}
                    className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  {idx === 0 ? '1° Primário' : `${idx + 1}° Backup`}
                </span>
                <span className="text-sm font-medium flex-1 truncate">📡 {inst.instance_name}</span>
                {!inst.ativo && <span className="text-xs text-amber-600 shrink-0">(inativo)</span>}
                <button onClick={() => removeInstance(inst.id)}
                  className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive rounded transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {availableToAdd.length > 0 && (
            <Select onValueChange={addInstance}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={
                  selectedInstances.length === 0
                    ? 'Selecionar instância primária...'
                    : 'Adicionar instância de backup...'
                } />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map(inst => (
                  <SelectItem key={inst.id} value={inst.id}>
                    📡 {inst.instance_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {dirty && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-8">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
