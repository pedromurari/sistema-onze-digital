import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2, Copy, CalendarCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';
import { AgendarSessaoDialog } from './AgendarSessaoDialog';

interface Terapeuta { id: string; nome: string; }
interface Slot { id: string; data: string; horario_inicio: string; horario_fim: string; status: 'livre' | 'ocupado'; reservado_nome: string | null; sessao_id: string | null; }
interface VendaPendente { id: string; cliente_nome: string; pendente: number; }

function hhmm(v: string) { return v.slice(0, 5); }
function dataBR(iso: string) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function AgendaTab() {
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [terapeutaId, setTerapeutaId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [vendasPendentes, setVendasPendentes] = useState<VendaPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dataNova, setDataNova] = useState('');
  const [inicioNovo, setInicioNovo] = useState('09:00');
  const [fimNovo, setFimNovo] = useState('10:00');
  const [salvando, setSalvando] = useState(false);
  const [slotParaAgendar, setSlotParaAgendar] = useState<Slot | null>(null);

  useEffect(() => {
    void supabase.from('diva_terapeutas').select('id,nome').order('nome').then(({ data }) => {
      setTerapeutas((data as Terapeuta[]) ?? []);
      setCarregando(false);
    });
  }, []);

  // Pendências dessa terapeuta: pega as vendas dela em diva_sessoes e
  // subtrai quantas já têm um horário "ocupado" vinculado (sessao_id) --
  // o que sobrar é o que ainda falta marcar na agenda.
  const carregarPendentes = async (id: string) => {
    const [vendasRes, agendadasRes] = await Promise.all([
      supabase.from('diva_sessoes').select('id,cliente_nome,quantidade_sessoes').eq('terapeuta_id', id),
      supabase.from('diva_disponibilidade_dias' as never).select('sessao_id').eq('terapeuta_id', id).eq('status', 'ocupado').not('sessao_id', 'is', null),
    ]);
    const contagem: Record<string, number> = {};
    for (const row of (agendadasRes.data as { sessao_id: string }[] | null) ?? []) {
      contagem[row.sessao_id] = (contagem[row.sessao_id] ?? 0) + 1;
    }
    const pendentes: VendaPendente[] = [];
    for (const v of (vendasRes.data as { id: string; cliente_nome: string; quantidade_sessoes: number }[] | null) ?? []) {
      const pendente = Math.max(0, (v.quantidade_sessoes ?? 1) - (contagem[v.id] ?? 0));
      if (pendente > 0) pendentes.push({ id: v.id, cliente_nome: v.cliente_nome, pendente });
    }
    setVendasPendentes(pendentes);
  };

  const carregarSlots = async (id: string) => {
    const { data } = await supabase.from('diva_disponibilidade_dias' as never)
      .select('id,data,horario_inicio,horario_fim,status,reservado_nome,sessao_id')
      .eq('terapeuta_id', id)
      .gte('data', hoje())
      .order('data').order('horario_inicio');
    setSlots((data as Slot[]) ?? []);
  };

  const selecionar = (id: string) => {
    setTerapeutaId(id);
    void carregarSlots(id);
    void carregarPendentes(id);
  };

  const recarregarTudo = () => {
    void carregarSlots(terapeutaId);
    void carregarPendentes(terapeutaId);
  };

  const copiarLinkPainel = async (id: string) => {
    const link = `${window.location.origin}/diva/terapeuta/${id}`;
    try { await navigator.clipboard.writeText(link); toast.success('Link do painel copiado.'); }
    catch { toast.error(`Não consegui copiar automático. Link: ${link}`, { duration: 15000 }); }
  };

  const adicionar = async () => {
    if (!terapeutaId || salvando || !dataNova) return;
    if (fimNovo <= inicioNovo) { toast.error('Horário final precisa ser depois do inicial.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('diva_disponibilidade_dias' as never).insert({
      terapeuta_id: terapeutaId, data: dataNova, horario_inicio: inicioNovo, horario_fim: fimNovo, status: 'livre',
    } as never);
    setSalvando(false);
    if (error) { toast.error('Não foi possível adicionar: ' + error.message); return; }
    await carregarSlots(terapeutaId);
  };

  const remover = async (slot: Slot) => {
    // Horário "ocupado" está vinculado a uma venda real (sessao_id) -- apagar
    // direto some com o agendamento sem desfazer nada no resto do sistema e
    // sem deixar rastro (já aconteceu sem querer). Exige confirmação extra.
    if (slot.status === 'ocupado') {
      const confirmado = window.confirm(
        slot.sessao_id
          ? 'Esse horário está ligado a uma sessão vendida. Apagar aqui NÃO cancela a venda, só desmarca a data -- ela volta a aparecer como pendente de agendamento. Tem certeza?'
          : `Esse horário está reservado${slot.reservado_nome ? ` pra ${slot.reservado_nome}` : ''} na agenda da terapeuta. Tem certeza que quer apagar?`
      );
      if (!confirmado) return;
    }
    await supabase.from('diva_disponibilidade_dias' as never).delete().eq('id', slot.id);
    recarregarTudo();
  };

  const totalPendente = vendasPendentes.reduce((soma, v) => soma + v.pendente, 0);

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Agenda de disponibilidade" icon={CalendarClock} />
          <p className="text-xs text-muted-foreground">
            Datas e horários dos próximos 30 dias que o próprio terapeuta preencheu pelo painel dele
            (link copiável abaixo). Ajuste manual aqui é só pra emergência.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={terapeutaId} onValueChange={selecionar}>
              <SelectTrigger className="max-w-sm"><SelectValue placeholder={carregando ? 'Carregando...' : 'Escolher terapeuta'} /></SelectTrigger>
              <SelectContent>
                {terapeutas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {terapeutaId && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copiarLinkPainel(terapeutaId)}>
                <Copy className="h-3.5 w-3.5" /> Copiar link do painel
              </Button>
            )}
            {terapeutaId && totalPendente > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-700">
                {totalPendente} sessão{totalPendente > 1 ? 'ões' : ''} pendente{totalPendente > 1 ? 's' : ''} de agendamento
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {terapeutaId && (
        <>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-2">
              <SectionBar title="Próximos horários disponíveis" />
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horário cadastrado nos próximos 30 dias ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {slots.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                      <span className="font-medium">{dataBR(s.data)}</span>
                      <span className="text-muted-foreground tabular-nums">{hhmm(s.horario_inicio)} – {hhmm(s.horario_fim)}</span>
                      <Badge
                        variant="outline"
                        className={s.status === 'ocupado' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}
                      >
                        {s.status === 'ocupado'
                          ? s.sessao_id
                            ? `Ocupado -- venda IDM${s.reservado_nome ? ` (${s.reservado_nome})` : ''}`
                            : s.reservado_nome
                              ? `Ocupado -- ${s.reservado_nome}`
                              : 'Ocupado'
                          : 'Livre'}
                      </Badge>
                      {s.status === 'livre' && vendasPendentes.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Agendar venda pendente nesse horário" onClick={() => setSlotParaAgendar(s)}>
                          <CalendarCheck2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remover(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed border-border/70">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Adicionar horário manualmente" icon={Plus} />
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Input type="date" value={dataNova} onChange={e => setDataNova(e.target.value)} min={hoje()} />
                <Input type="time" value={inicioNovo} onChange={e => setInicioNovo(e.target.value)} />
                <Input type="time" value={fimNovo} onChange={e => setFimNovo(e.target.value)} />
                <Button onClick={() => void adicionar()} disabled={salvando || !dataNova}>Adicionar</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {slotParaAgendar && (
        <AgendarSessaoDialog
          mode="porSlot"
          open={!!slotParaAgendar}
          onOpenChange={(open) => { if (!open) setSlotParaAgendar(null); }}
          slot={slotParaAgendar}
          vendasPendentes={vendasPendentes}
          onConfirmado={recarregarTudo}
        />
      )}
    </div>
  );
}
