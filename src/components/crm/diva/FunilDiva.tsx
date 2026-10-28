import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionBar } from '@/components/crm/ui/premium';
import { DIVA_VENDORS } from '@/lib/divaVendedores';

const ETAPAS = [
  { key: 'novo', label: 'Novo' },
  { key: 'contato', label: 'Em contato' },
  { key: 'negociacao', label: 'Negociação' },
  { key: 'fechado', label: 'Fechado' },
  { key: 'perdido', label: 'Perdido' },
] as const;

interface LeadDiva {
  id: string; nome: string; whatsapp: string | null; email: string | null;
  interesse_produto: string | null; observacoes: string | null; status: string; vendedor: string | null; criado_em: string;
}

export function FunilDiva() {
  const [leads, setLeads] = useState<LeadDiva[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('leads').select('id,nome,whatsapp,email,interesse_produto,observacoes,status,vendedor,criado_em')
      .eq('produto', 'diva_idm').order('criado_em', { ascending: false });
    setLeads((data as LeadDiva[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const moverEtapa = async (id: string, status: string) => {
    await supabase.from('leads').update({ status }).eq('id', id);
    await carregar();
  };

  const pegarLead = async (id: string, vendedor: string) => {
    await supabase.from('leads').update({ vendedor, status: 'contato' }).eq('id', id).is('vendedor', null);
    await carregar();
  };

  const devolverLead = async (id: string) => {
    await supabase.from('leads').update({ vendedor: null }).eq('id', id);
    await carregar();
  };

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando funil...</p>;

  return (
    <div className="space-y-4">
      {DIVA_VENDORS.length === 0 && (
        <Card className="border-amber-300/50 shadow-sm">
          <CardContent className="p-3 text-sm text-amber-700">
            Nenhum vendedor do Divã cadastrado ainda em <code>src/lib/divaVendedores.ts</code>.
            Leads chegam normalmente, mas "Pegar lead" precisa de pelo menos um vendedor na lista.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-5">
        {ETAPAS.map(etapa => {
          const leadsEtapa = leads.filter(l => l.status === etapa.key || (etapa.key === 'novo' && !ETAPAS.some(e => e.key === l.status)));
          return (
            <Card key={etapa.key} className="border-border/70 shadow-sm">
              <CardContent className="p-3 space-y-2">
                <SectionBar title={`${etapa.label} (${leadsEtapa.length})`} />
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {leadsEtapa.map(lead => (
                    <div key={lead.id} className="rounded-lg border border-border/60 p-2.5 space-y-1.5 text-xs">
                      <p className="font-medium text-sm">{lead.nome}</p>
                      {lead.whatsapp && <p className="text-muted-foreground">{lead.whatsapp}</p>}
                      {lead.interesse_produto && <p className="text-muted-foreground">{lead.interesse_produto}</p>}
                      <div>
                        {lead.vendedor ? <Badge variant="outline">{lead.vendedor}</Badge> : <Badge variant="outline" className="bg-amber-50 text-amber-700">Sem vendedor</Badge>}
                      </div>
                      {!lead.vendedor && DIVA_VENDORS.length > 0 && (
                        <Select onValueChange={(v) => void pegarLead(lead.id, v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pegar lead" /></SelectTrigger>
                          <SelectContent>
                            {DIVA_VENDORS.map(v => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {lead.vendedor && <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => void devolverLead(lead.id)}>Devolver</Button>}
                      <Select value={etapa.key} onValueChange={(v) => void moverEtapa(lead.id, v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ETAPAS.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {leadsEtapa.length === 0 && <p className="text-xs text-muted-foreground italic px-1">Vazio</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {leads.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <UserPlus className="h-8 w-8" />
          <p className="text-sm">Nenhum lead do Divã ainda — a página pública é /diva.</p>
        </div>
      )}
    </div>
  );
}
