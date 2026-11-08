import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';

interface Terapeuta { id: string; nome: string; }
interface Slot { id: string; dia_semana: number; horario_inicio: string; horario_fim: string; ativo: boolean; }

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function hhmm(v: string) { return v.slice(0, 5); }

export function AgendaTab() {
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [terapeutaId, setTerapeutaId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [diaNovo, setDiaNovo] = useState('1');
  const [inicioNovo, setInicioNovo] = useState('09:00');
  const [fimNovo, setFimNovo] = useState('10:00');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void supabase.from('diva_terapeutas').select('id,nome').order('nome').then(({ data }) => {
      setTerapeutas((data as Terapeuta[]) ?? []);
      setCarregando(false);
    });
  }, []);

  const carregarSlots = async (id: string) => {
    const { data } = await supabase.from('diva_disponibilidade' as never)
      .select('id,dia_semana,horario_inicio,horario_fim,ativo').eq('terapeuta_id', id)
      .order('dia_semana').order('horario_inicio');
    setSlots((data as Slot[]) ?? []);
  };

  const selecionar = (id: string) => { setTerapeutaId(id); void carregarSlots(id); };

  const adicionar = async () => {
    if (!terapeutaId || salvando) return;
    if (fimNovo <= inicioNovo) { toast.error('Horário final precisa ser depois do inicial.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('diva_disponibilidade' as never).insert({
      terapeuta_id: terapeutaId, dia_semana: Number(diaNovo), horario_inicio: inicioNovo, horario_fim: fimNovo, ativo: true,
    } as never);
    setSalvando(false);
    if (error) { toast.error('Não foi possível adicionar: ' + error.message); return; }
    await carregarSlots(terapeutaId);
  };

  const alternarAtivo = async (slot: Slot) => {
    await supabase.from('diva_disponibilidade' as never).update({ ativo: !slot.ativo } as never).eq('id', slot.id);
    await carregarSlots(terapeutaId);
  };

  const remover = async (id: string) => {
    await supabase.from('diva_disponibilidade' as never).delete().eq('id', id);
    await carregarSlots(terapeutaId);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Agenda de disponibilidade" icon={CalendarClock} />
          <p className="text-xs text-muted-foreground">
            Grade semanal recorrente — usada pelo time comercial pra saber quando o terapeuta está livre ao negociar uma sessão com o lead.
          </p>
          <Select value={terapeutaId} onValueChange={selecionar}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder={carregando ? 'Carregando...' : 'Escolher terapeuta'} /></SelectTrigger>
            <SelectContent>
              {terapeutas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {terapeutaId && (
        <>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-2">
              <SectionBar title="Horários cadastrados" />
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horário cadastrado ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {slots.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                      <span className="font-medium">{DIAS[s.dia_semana]}</span>
                      <span className="text-muted-foreground tabular-nums">{hhmm(s.horario_inicio)} – {hhmm(s.horario_fim)}</span>
                      <Badge
                        variant="outline"
                        className={`cursor-pointer ${s.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                        onClick={() => void alternarAtivo(s)}
                      >
                        {s.ativo ? 'Ativo' : 'Pausado'}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remover(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed border-border/70">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Adicionar horário" icon={Plus} />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Select value={diaNovo} onValueChange={setDiaNovo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="time" value={inicioNovo} onChange={e => setInicioNovo(e.target.value)} />
                <Input type="time" value={fimNovo} onChange={e => setFimNovo(e.target.value)} />
                <Button onClick={() => void adicionar()} disabled={salvando}>Adicionar</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
