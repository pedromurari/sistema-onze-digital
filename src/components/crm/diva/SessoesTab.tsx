import { Fragment, useEffect, useState } from 'react';
import { CalendarPlus, ChevronDown, ChevronRight, CalendarCheck2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';
import { AgendarSessaoDialog } from './AgendarSessaoDialog';

interface Terapeuta { id: string; nome: string; whatsapp: string | null; }

async function avisarTerapeutaNovaVenda(terapeuta: Terapeuta, s: {
  cliente_nome: string; tipo: string; quantidade: number; valor_total: number;
}): Promise<boolean> {
  if (!terapeuta.whatsapp) return false;
  const primeiroNome = terapeuta.nome.split(' ')[0];
  const descricaoPacote = s.tipo === 'pacote' ? `pacote de ${s.quantidade} sessões` : `${s.quantidade} sessão${s.quantidade > 1 ? 'ões' : ''} avulsa${s.quantidade > 1 ? 's' : ''}`;
  const mensagem = `Oi, ${primeiroNome}! Aqui é o time do Divã IDM 💙\n\nSaiu uma venda nova pra você:\n\n👤 Cliente: ${s.cliente_nome}\n📦 ${descricaoPacote}\n💰 Valor: ${formatReal(s.valor_total)}\n\nJá atualizei isso no seu painel (aba "Minhas sessões"). Só falta combinar com ${s.cliente_nome.split(' ')[0]} o dia e horário — pode marcar direto lá na sua agenda, no mesmo link que você já tem.`;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/wpp-enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({ numero: terapeuta.whatsapp, mensagem, instance_name: 'Divã IDM' }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.ok === true;
  } catch {
    // Falha no aviso não deve travar o registro da venda -- vendedora já vê
    // na tela que salvou; o aviso é um extra, não a fonte de verdade.
    return false;
  }
}
interface LeadDiva { id: string; nome: string; whatsapp: string | null; }
interface Sessao {
  id: string; cliente_nome: string; cliente_whatsapp: string | null; cliente_id: string | null; tipo: string;
  valor_total: number; valor_terapeuta: number; valor_idm: number; quantidade_sessoes: number;
  status_pagamento: string; status_repasse: string; terapeuta_id: string | null;
}
interface Ficha {
  chave: string; cliente_id: string | null; cliente_nome: string; cliente_whatsapp: string | null;
  vendas: Sessao[]; totalSessoes: number; totalValor: number; totalPendente: number;
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
  const [agendadasPorVenda, setAgendadasPorVenda] = useState<Record<string, number>>({});
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [leads, setLeads] = useState<LeadDiva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [clienteNome, setClienteNome] = useState('');
  const [clienteWhatsapp, setClienteWhatsapp] = useState('');
  const [terapeutaId, setTerapeutaId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [pacoteLabel, setPacoteLabel] = useState<string>(OPCOES_PACOTE[0].label);
  const [valorTotal, setValorTotal] = useState('80');
  const [quantidadeSessoes, setQuantidadeSessoes] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [agendarVenda, setAgendarVenda] = useState<{ id: string; terapeuta_id: string; cliente_nome: string; pendente: number } | null>(null);

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
    const [sessoesRes, agendadasRes, terapeutasRes, leadsRes] = await Promise.all([
      supabase.from('diva_sessoes').select('*').order('created_at', { ascending: false }),
      supabase.from('diva_disponibilidade_dias' as never).select('sessao_id').eq('status', 'ocupado').not('sessao_id', 'is', null),
      supabase.from('diva_terapeutas').select('id,nome,whatsapp').eq('status', 'aprovado'),
      supabase.from('leads').select('id,nome,whatsapp').eq('produto', 'diva_idm').neq('status', 'perdido').order('criado_em', { ascending: false }).limit(100),
    ]);
    setSessoes((sessoesRes.data as Sessao[]) ?? []);
    const contagem: Record<string, number> = {};
    for (const row of (agendadasRes.data as { sessao_id: string }[] | null) ?? []) {
      contagem[row.sessao_id] = (contagem[row.sessao_id] ?? 0) + 1;
    }
    setAgendadasPorVenda(contagem);
    setTerapeutas((terapeutasRes.data as Terapeuta[]) ?? []);
    setLeads((leadsRes.data as LeadDiva[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const registrar = async () => {
    if (!clienteNome.trim() || salvando) return;
    setSalvando(true);
    const total = Number(valorTotal) || 80;
    const quantidade = Number(quantidadeSessoes) || 1;
    // diva_sessoes.tipo só aceita 'avulsa'/'pacote' no banco -- as opções do
    // select (pacote_3/4/5, personalizado) são só pra UX escolher valor e
    // quantidade rápido; quem decide o tipo real gravado é a quantidade.
    const tipoBanco = quantidade >= 3 ? 'pacote' : 'avulsa';
    const nomeCliente = clienteNome.trim();
    const whatsappCliente = clienteWhatsapp.trim() || null;

    // Acha (ou cria) a ficha única do cliente antes de gravar a venda, pra
    // recompra do mesmo cliente cair na mesma ficha em vez de duplicar.
    const { data: clienteId, error: clienteError } = await supabase.rpc('diva_cliente_vincular' as never, {
      p_nome: nomeCliente, p_whatsapp: whatsappCliente,
    } as never);
    if (clienteError) { setSalvando(false); toast.error('Não foi possível achar/criar a ficha do cliente: ' + clienteError.message); return; }

    const { error } = await supabase.from('diva_sessoes').insert({
      cliente_nome: nomeCliente,
      cliente_whatsapp: whatsappCliente,
      cliente_id: clienteId as unknown as string,
      terapeuta_id: terapeutaId || null,
      lead_id: leadId || null,
      tipo: tipoBanco,
      quantidade_sessoes: quantidade,
      valor_total: total,
      // Terapeuta recebe R$50 fixo por sessão (não percentual) -- com
      // desconto de pacote, uma % só da sessão avulsa (R$80) deixava a
      // terapeuta com menos que R$50/sessão. Math.min evita valor_idm
      // negativo se alguém registrar um total abaixo do piso por engano.
      valor_terapeuta: Math.min(total, quantidade * 50),
      valor_idm: Math.max(0, Math.round((total - Math.min(total, quantidade * 50)) * 100) / 100),
    } as never);
    setSalvando(false);
    if (error) { toast.error('Não foi possível registrar a sessão: ' + error.message); return; }
    toast.success('Sessão registrada.');

    const terapeuta = terapeutas.find(t => t.id === terapeutaId);
    if (terapeuta) {
      void avisarTerapeutaNovaVenda(terapeuta, { cliente_nome: nomeCliente, tipo: tipoBanco, quantidade, valor_total: total })
        .then((ok) => {
          if (ok) toast.success(`Terapeuta avisada no WhatsApp (${terapeuta.nome.split(' ')[0]}).`);
          else toast.error(`Não consegui avisar ${terapeuta.nome.split(' ')[0]} no WhatsApp. Avisa você mesma.`);
        });
    }

    setClienteNome(''); setClienteWhatsapp(''); setTerapeutaId(''); setLeadId('');
    escolherPacote(OPCOES_PACOTE[0].label);
    await carregar();
  };

  const marcar = async (id: string, campo: 'status_pagamento' | 'status_repasse', valor: string) => {
    await supabase.from('diva_sessoes').update({ [campo]: valor }).eq('id', id);
    await carregar();
  };

  const nomeTerapeuta = (id: string | null) => terapeutas.find(t => t.id === id)?.nome ?? '—';

  // Agrupa as vendas soltas numa ficha por cliente -- chave preferida é
  // cliente_id (ficha de verdade); linhas antigas sem cliente_id (não
  // deveria existir após a migration, mas por segurança) caem pelo nome.
  const fichas: Ficha[] = (() => {
    const mapa = new Map<string, Ficha>();
    for (const s of sessoes) {
      const chave = s.cliente_id ?? `nome:${s.cliente_nome.trim().toLowerCase()}`;
      const pendenteDaVenda = Math.max(0, (s.quantidade_sessoes ?? 1) - (agendadasPorVenda[s.id] ?? 0));
      let ficha = mapa.get(chave);
      if (!ficha) {
        ficha = { chave, cliente_id: s.cliente_id, cliente_nome: s.cliente_nome, cliente_whatsapp: s.cliente_whatsapp, vendas: [], totalSessoes: 0, totalValor: 0, totalPendente: 0 };
        mapa.set(chave, ficha);
      }
      ficha.vendas.push(s);
      ficha.totalSessoes += s.quantidade_sessoes ?? 1;
      ficha.totalValor += Number(s.valor_total);
      ficha.totalPendente += pendenteDaVenda;
    }
    return Array.from(mapa.values());
  })();

  const toggleExpandido = (chave: string) => setExpandidos(e => ({ ...e, [chave]: !e[chave] }));

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title={`Sessões (${carregando ? '—' : fichas.length} ${fichas.length === 1 ? 'cliente' : 'clientes'})`} />
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : fichas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="p-2"></th>
                  <th className="p-2">Cliente</th><th className="p-2">Terapeuta</th>
                  <th className="p-2 text-center">Sessões</th><th className="p-2 text-right">Total</th>
                  <th className="p-2">Agendamento</th>
                </tr></thead>
                <tbody>
                  {fichas.map(f => {
                    const aberto = !!expandidos[f.chave];
                    const terapeutasUnicos = Array.from(new Set(f.vendas.map(v => v.terapeuta_id).filter(Boolean)));
                    const rotuloTerapeuta = terapeutasUnicos.length === 0 ? '—' : terapeutasUnicos.length === 1 ? nomeTerapeuta(terapeutasUnicos[0]) : `${terapeutasUnicos.length} terapeutas`;
                    return (
                      <Fragment key={f.chave}>
                        <tr className="border-b cursor-pointer hover:bg-muted/40" onClick={() => toggleExpandido(f.chave)}>
                          <td className="p-2 w-6 text-muted-foreground">{aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="p-2 font-medium">
                            {f.cliente_nome}
                            {f.vendas.length > 1 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({f.vendas.length} compras)</span>}
                          </td>
                          <td className="p-2 text-muted-foreground">{rotuloTerapeuta}</td>
                          <td className="p-2 text-center tabular-nums text-muted-foreground">{f.totalSessoes}</td>
                          <td className="p-2 text-right tabular-nums">{formatReal(f.totalValor)}</td>
                          <td className="p-2">
                            <Badge variant="outline" className={f.totalPendente > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>
                              {f.totalPendente > 0 ? `${f.totalPendente} pendente${f.totalPendente > 1 ? 's' : ''}` : 'Tudo agendado'}
                            </Badge>
                          </td>
                        </tr>
                        {aberto && f.vendas.map(s => {
                          const agendadas = agendadasPorVenda[s.id] ?? 0;
                          const pendente = Math.max(0, (s.quantidade_sessoes ?? 1) - agendadas);
                          return (
                            <tr key={s.id} className="border-b last:border-0 bg-muted/20">
                              <td className="p-2"></td>
                              <td className="p-2 pl-6 text-xs text-muted-foreground">compra</td>
                              <td className="p-2 text-muted-foreground">{nomeTerapeuta(s.terapeuta_id)}</td>
                              <td className="p-2 text-center tabular-nums text-muted-foreground">{s.quantidade_sessoes ?? 1}</td>
                              <td className="p-2 text-right tabular-nums">{formatReal(Number(s.valor_total))}</td>
                              <td className="p-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className={pendente > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>
                                    {agendadas}/{s.quantidade_sessoes ?? 1} agendadas
                                  </Badge>
                                  {pendente > 0 && s.terapeuta_id && (
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6"
                                      title="Agendar sessão pendente"
                                      onClick={(e) => { e.stopPropagation(); setAgendarVenda({ id: s.id, terapeuta_id: s.terapeuta_id!, cliente_nome: s.cliente_nome, pendente }); }}
                                    >
                                      <CalendarCheck2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={`cursor-pointer ${s.status_pagamento === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                                    onClick={(e) => { e.stopPropagation(); void marcar(s.id, 'status_pagamento', s.status_pagamento === 'pago' ? 'pendente' : 'pago'); }}
                                  >
                                    {s.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={`cursor-pointer ${s.status_repasse === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                                    onClick={(e) => { e.stopPropagation(); void marcar(s.id, 'status_repasse', s.status_repasse === 'pago' ? 'pendente' : 'pago'); }}
                                  >
                                    {s.status_repasse === 'pago' ? `Repassado (${formatReal(Number(s.valor_terapeuta))})` : `A repassar (${formatReal(Number(s.valor_terapeuta))})`}
                                  </Badge>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
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
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger><SelectValue placeholder="Lead do funil (opcional)" /></SelectTrigger>
              <SelectContent>
                {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}{l.whatsapp ? ` — ${l.whatsapp}` : ''}</SelectItem>)}
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

      {agendarVenda && (
        <AgendarSessaoDialog
          mode="porVenda"
          open={!!agendarVenda}
          onOpenChange={(open) => { if (!open) setAgendarVenda(null); }}
          venda={agendarVenda}
          onConfirmado={() => void carregar()}
        />
      )}
    </div>
  );
}
