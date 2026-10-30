import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';

interface Terapeuta { id: string; nome: string; }
interface Sessao {
  id: string; cliente_nome: string; cliente_whatsapp: string | null; tipo: string;
  valor_total: number; valor_terapeuta: number; valor_idm: number; quantidade_sessoes: number;
  status_pagamento: string; status_repasse: string; terapeuta_id: string | null;
}

function formatReal(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Tabela oficial de preços do Divã IDM. Pacotes de 3+ saem com desconto; abaixo
// disso (1 ou 2 sessões) é sempre R$80/sessão. Nem todo cliente fecha pacote —
// muitos pagam a quantidade avulsa que quiserem sem pedir desconto, por isso o
// valor final continua editável abaixo.
const OPCOES_PACOTE = [
  { tipo: 'avulsa', quantidade: 1, valor: 80, label: '1 sessão — R$ 80,00' },
  { tipo: 'avulsa', quantidade: 2, valor: 160, label: '2 sessões — R$ 160,00' },
  { tipo: 'pacote_3', quantidade: 3, valor: 210, label: 'Pacote 3 sessões — R$ 210,00' },
  { tipo: 'pacote_4', quantidade: 4, valor: 280, label: 'Pacote 4 sessões — R$ 280,00' },
  { tipo: 'pacote_5', quantidade: 5, valor: 350, label: 'Pacote 5 sessões — R$ 350,00' },
  { tipo: 'personalizado', quantidade: 1, valor: 80, label: 'Outro valor (personalizado)' },
] as const;

export function SessoesTab() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [clienteNome, setClienteNome] = useState('');
  const [clienteWhatsapp, setClienteWhatsapp] = useState('');
  const [terapeutaId, setTerapeutaId] = useState('');
  const [pacoteLabel, setPacoteLabel] = useState<string>(OPCOES_PACOTE[0].label);
  const [valorTotal, setValorTotal] = useState('80');
  const [quantidadeSessoes, setQuantidadeSessoes] = useState('1');
  const [salvando, setSalvando] = useState(false);

  const escolherPacote = (label: string) => {
    setPacoteLabel(label);
    const opcao = OPCOES_PACOTE.find(o => o.label === label);
    if (opcao) {
      setValorTotal(String(opcao.valor));
      setQuantidadeSessoes(String(opcao.quantidade));
    }
  };

  const tipoSelecionado = OPCOES_PACOTE.find(o => o.label === pacoteLabel)?.tipo ?? 'personalizado';

  const carregar = async () => {
    setCarregando(true);
    const [sessoesRes, terapeutasRes] = await Promise.all([
      supabase.from('diva_sessoes').select('*').order('created_at', { ascending: false }),
      supabase.from('diva_terapeutas').select('id,nome').eq('status', 'aprovado'),
    ]);
    setSessoes((sessoesRes.data as Sessao[]) ?? []);
    setTerapeutas((terapeutasRes.data as Terapeuta[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const registrar = async () => {
    if (!clienteNome.trim() || salvando) return;
    setSalvando(true);
    const total = Number(valorTotal) || 80;
    const quantidade = Number(quantidadeSessoes) || 1;
    await supabase.from('diva_sessoes').insert({
      cliente_nome: clienteNome.trim(),
      cliente_whatsapp: clienteWhatsapp.trim() || null,
      terapeuta_id: terapeutaId || null,
      tipo: tipoSelecionado,
      quantidade_sessoes: quantidade,
      valor_total: total,
      valor_terapeuta: Math.round(total * (50 / 80) * 100) / 100,
      valor_idm: Math.round(total * (30 / 80) * 100) / 100,
    });
    setClienteNome(''); setClienteWhatsapp(''); setTerapeutaId('');
    escolherPacote(OPCOES_PACOTE[0].label);
    setSalvando(false);
    await carregar();
  };

  const marcar = async (id: string, campo: 'status_pagamento' | 'status_repasse', valor: string) => {
    await supabase.from('diva_sessoes').update({ [campo]: valor }).eq('id', id);
    await carregar();
  };

  const nomeTerapeuta = (id: string | null) => terapeutas.find(t => t.id === id)?.nome ?? '—';

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title={`Sessões (${carregando ? '—' : sessoes.length})`} />
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : sessoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2">Cliente</th><th className="p-2">Terapeuta</th><th className="p-2 text-center">Sessões</th><th className="p-2 text-right">Total</th>
                  <th className="p-2">Pagamento</th><th className="p-2">Repasse</th>
                </tr></thead>
                <tbody>
                  {sessoes.map(s => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{s.cliente_nome}</td>
                      <td className="p-2 text-muted-foreground">{nomeTerapeuta(s.terapeuta_id)}</td>
                      <td className="p-2 text-center tabular-nums text-muted-foreground">{s.quantidade_sessoes ?? 1}</td>
                      <td className="p-2 text-right tabular-nums">{formatReal(Number(s.valor_total))}</td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className={`cursor-pointer ${s.status_pagamento === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          onClick={() => void marcar(s.id, 'status_pagamento', s.status_pagamento === 'pago' ? 'pendente' : 'pago')}
                        >
                          {s.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className={`cursor-pointer ${s.status_repasse === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                          onClick={() => void marcar(s.id, 'status_repasse', s.status_repasse === 'pago' ? 'pendente' : 'pago')}
                        >
                          {s.status_repasse === 'pago' ? `Repassado (${formatReal(Number(s.valor_terapeuta))})` : `A repassar (${formatReal(Number(s.valor_terapeuta))})`}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-border/70">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Registrar sessão fechada" icon={CalendarPlus} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Nome do cliente" value={clienteNome} onChange={e => setClienteNome(e.target.value)} />
            <Input placeholder="WhatsApp do cliente" value={clienteWhatsapp} onChange={e => setClienteWhatsapp(e.target.value)} />
            <Select value={terapeutaId} onValueChange={setTerapeutaId}>
              <SelectTrigger><SelectValue placeholder="Terapeuta" /></SelectTrigger>
              <SelectContent>
                {terapeutas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={pacoteLabel} onValueChange={escolherPacote}>
              <SelectTrigger><SelectValue placeholder="Pacote" /></SelectTrigger>
              <SelectContent>
                {OPCOES_PACOTE.map(o => <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Quantidade de sessões" value={quantidadeSessoes} onChange={e => setQuantidadeSessoes(e.target.value)} />
            <Input type="number" placeholder="Valor total" value={valorTotal} onChange={e => setValorTotal(e.target.value)} />
          </div>
          {tipoSelecionado.startsWith('pacote') && (
            <p className="text-xs text-muted-foreground">
              Pacote: pagamento integral antes da 1ª sessão. Se o cliente não pediu desconto e já mandou o
              valor de forma antecipada pela quantidade avulsa, use "Outro valor (personalizado)" acima.
            </p>
          )}
          <Button onClick={() => void registrar()} disabled={salvando || !clienteNome.trim()}>Registrar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
