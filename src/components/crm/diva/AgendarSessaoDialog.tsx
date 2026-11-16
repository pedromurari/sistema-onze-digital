import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

function hhmm(v: string) { return v.slice(0, 5); }
function dataBR(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

interface SlotLivre { id: string; data: string; horario_inicio: string; horario_fim: string; }
interface VendaPendente { id: string; cliente_nome: string; pendente: number; }

// Popup de agendamento do Divã -- usado nos dois sentidos:
// "porVenda" (aba Sessões: já sei a venda, escolho entre os horários livres
// que a própria terapeuta cadastrou) e "porSlot" (aba Agenda: já sei o
// horário livre, escolho qual venda pendente daquela terapeuta vai usá-lo).
type Props =
  | {
      mode: 'porVenda';
      open: boolean;
      onOpenChange: (open: boolean) => void;
      venda: { id: string; terapeuta_id: string; cliente_nome: string; pendente: number };
      onConfirmado: () => void;
    }
  | {
      mode: 'porSlot';
      open: boolean;
      onOpenChange: (open: boolean) => void;
      slot: { id: string; data: string; horario_inicio: string; horario_fim: string };
      vendasPendentes: VendaPendente[];
      onConfirmado: () => void;
    };

export function AgendarSessaoDialog(props: Props) {
  const { open, onOpenChange, onConfirmado } = props;
  const [slotsLivres, setSlotsLivres] = useState<SlotLivre[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [vendaEscolhida, setVendaEscolhida] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) { setSelecionados([]); setVendaEscolhida(''); return; }
    if (props.mode !== 'porVenda') return;
    setCarregando(true);
    void supabase.from('diva_disponibilidade_dias' as never)
      .select('id,data,horario_inicio,horario_fim')
      .eq('terapeuta_id', props.venda.terapeuta_id)
      .eq('status', 'livre')
      .gte('data', hoje())
      .order('data').order('horario_inicio')
      .then(({ data }) => { setSlotsLivres((data as SlotLivre[]) ?? []); setCarregando(false); });
  }, [open, props.mode, props.mode === 'porVenda' ? props.venda.terapeuta_id : null]);

  const alternarSlot = (id: string) => {
    if (props.mode !== 'porVenda') return;
    setSelecionados(sel => {
      if (sel.includes(id)) return sel.filter(s => s !== id);
      if (sel.length >= props.venda.pendente) {
        toast.error(`Você só pode marcar ${props.venda.pendente} horário${props.venda.pendente > 1 ? 's' : ''} pra essa venda.`);
        return sel;
      }
      return [...sel, id];
    });
  };

  const confirmar = async () => {
    if (salvando) return;
    setSalvando(true);
    if (props.mode === 'porVenda') {
      if (selecionados.length === 0) { setSalvando(false); return; }
      const { error } = await supabase.from('diva_disponibilidade_dias' as never)
        .update({ status: 'ocupado', sessao_id: props.venda.id } as never)
        .in('id', selecionados);
      setSalvando(false);
      if (error) { toast.error('Não foi possível agendar: ' + error.message); return; }
      toast.success('Sessão agendada.');
      onOpenChange(false);
      onConfirmado();
    } else {
      if (!vendaEscolhida) { setSalvando(false); return; }
      const { error } = await supabase.from('diva_disponibilidade_dias' as never)
        .update({ status: 'ocupado', sessao_id: vendaEscolhida } as never)
        .eq('id', props.slot.id);
      setSalvando(false);
      if (error) { toast.error('Não foi possível agendar: ' + error.message); return; }
      toast.success('Sessão agendada.');
      onOpenChange(false);
      onConfirmado();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {props.mode === 'porVenda' ? (
          <>
            <DialogHeader>
              <DialogTitle>Agendar sessão — {props.venda.cliente_nome}</DialogTitle>
              <DialogDescription>
                Escolha {props.venda.pendente === 1 ? 'o horário' : `até ${props.venda.pendente} horários`} nos livres que a
                terapeuta já cadastrou. Selecionados: {selecionados.length}/{props.venda.pendente}.
              </DialogDescription>
            </DialogHeader>
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando horários...</p>
            ) : slotsLivres.length === 0 ? (
              <p className="text-sm text-muted-foreground">Essa terapeuta não tem horário livre cadastrado. Avisa ela pra preencher a agenda dela no painel.</p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {slotsLivres.map(s => (
                  <label key={s.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={selecionados.includes(s.id)} onCheckedChange={() => alternarSlot(s.id)} />
                    <span className="font-medium">{dataBR(s.data)}</span>
                    <span className="text-muted-foreground tabular-nums">{hhmm(s.horario_inicio)} – {hhmm(s.horario_fim)}</span>
                  </label>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={salvando || selecionados.length === 0}>
                {salvando ? 'Agendando...' : `Confirmar (${selecionados.length})`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Agendar {dataBR(props.slot.data)} às {hhmm(props.slot.horario_inicio)}</DialogTitle>
              <DialogDescription>Escolha qual venda pendente dessa terapeuta vai usar esse horário.</DialogDescription>
            </DialogHeader>
            {props.vendasPendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Essa terapeuta não tem nenhuma venda pendente de agendamento.</p>
            ) : (
              <RadioGroup value={vendaEscolhida} onValueChange={setVendaEscolhida} className="max-h-80 space-y-1.5 overflow-y-auto">
                {props.vendasPendentes.map(v => (
                  <Label key={v.id} htmlFor={`venda-${v.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 font-normal">
                    <RadioGroupItem value={v.id} id={`venda-${v.id}`} />
                    <span className="font-medium">{v.cliente_nome}</span>
                    <span className="text-muted-foreground">— {v.pendente} sessão{v.pendente > 1 ? 'ões' : ''} pendente{v.pendente > 1 ? 's' : ''}</span>
                  </Label>
                ))}
              </RadioGroup>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={salvando || !vendaEscolhida}>
                {salvando ? 'Agendando...' : 'Confirmar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
