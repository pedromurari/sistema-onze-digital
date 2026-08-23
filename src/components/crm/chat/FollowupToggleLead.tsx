import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { sufixo } from '@/lib/chat-utils';
import { toast } from 'sonner';

/**
 * Interruptor de follow-up automático de UM lead — pra tirar ele da sequência
 * automática sem desligar pra carteira inteira do vendedor. Casa a conversa
 * (por telefone) com a lead do Time Comercial pelo sufixo de 8 dígitos, mesmo
 * padrão de identidade que `useConversas` já usa pra resolver nome/categoria.
 *
 * Sem lead correspondente em `leads` (origem Time Comercial) não mostra nada —
 * não tem o que pausar.
 */
export function FollowupToggleLead({ telefone }: { telefone: string }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [pausado, setPausado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const suf = sufixo(telefone);
    if (!suf) { setLeadId(null); return; }
    const { data } = await supabase
      .from('leads')
      .select('id, followup_pausado')
      .eq('origem', 'Time Comercial')
      .or(`whatsapp.like.*${suf},telefone.like.*${suf}`)
      .limit(1)
      .maybeSingle();
    if (data) {
      setLeadId(data.id);
      setPausado(!!(data as any).followup_pausado);
    } else {
      setLeadId(null);
    }
  }, [telefone]);

  useEffect(() => { carregar(); }, [carregar]);

  const alternar = async (novoAtivo: boolean) => {
    if (!leadId) return;
    setSalvando(true);
    const { error } = await supabase.from('leads').update({ followup_pausado: !novoAtivo }).eq('id', leadId);
    setSalvando(false);
    if (error) { toast.error(`Erro ao atualizar follow-up: ${error.message}`); return; }
    setPausado(!novoAtivo);
    toast.success(novoAtivo ? 'Follow-up automático ligado pra esse lead' : 'Follow-up automático desligado pra esse lead');
  };

  if (!leadId) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 shrink-0" title="Follow-up automático deste lead">
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">Follow-up</span>
      <Switch checked={!pausado} onCheckedChange={alternar} disabled={salvando} className="scale-75" />
    </div>
  );
}
