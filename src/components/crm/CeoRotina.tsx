import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Plus, Target, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

// Meta de Novembro/2026 (pedido do Pedro, 04/11/2026) -- R$30k de faturamento,
// 25 matrículas (20 Ellen + 5 indicação/base), R$4k de tráfego. Constante de
// propósito -- é a meta DESTE mês; ajustar/apagar quando novembro acabar.
const META_MES_LABEL = 'Novembro/2026';
const META_FATURAMENTO = 30000;
const META_MATRICULAS = 25;
const META_TRAFEGO = 4000;
const META_INICIO = '2026-11-01';

function formatReal(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function useMetaNovembro() {
  const [faturamento, setFaturamento] = useState(0);
  const [matriculas, setMatriculas] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      setCarregando(true);
      const [pagRes, alunosRes] = await Promise.all([
        supabase.from('pagamentos').select('valor').eq('status', 'pago').gte('data_pagamento', META_INICIO),
        supabase.from('alunos').select('id', { count: 'exact', head: true }).gte('data_matricula', META_INICIO),
      ]);
      if (!ativo) return;
      const total = ((pagRes.data as { valor: number }[] | null) ?? []).reduce((s, p) => s + Number(p.valor), 0);
      setFaturamento(total);
      setMatriculas(alunosRes.count ?? 0);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  return { faturamento, matriculas, carregando };
}

interface ItemRotina { id: string; departamento: string; texto: string; ordem: number; ativo: boolean; data_alvo: string | null; }

const DEPARTAMENTOS: { valor: string; label: string }[] = [
  { valor: 'financeiro', label: 'Financeiro' },
  { valor: 'comercial', label: 'Comercial' },
  { valor: 'pedagogico', label: 'Pedagógico' },
  { valor: 'marketing', label: 'Marketing' },
  { valor: 'rh', label: 'RH' },
  { valor: 'geral', label: 'Geral' },
];

function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function CeoRotina() {
  const [itens, setItens] = useState<ItemRotina[]>([]);
  const [concluidosHoje, setConcluidosHoje] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [novoDepartamento, setNovoDepartamento] = useState('financeiro');
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeBrasil();

  const carregar = async () => {
    setCarregando(true);
    const [itensRes, concluidosRes] = await Promise.all([
      supabase.from('ceo_rotina_itens').select('*').eq('ativo', true).or(`data_alvo.is.null,data_alvo.eq.${hoje}`).order('ordem'),
      supabase.from('ceo_rotina_conclusoes').select('item_id').eq('data', hoje),
    ]);
    setItens((itensRes.data as ItemRotina[]) ?? []);
    setConcluidosHoje(new Set((concluidosRes.data ?? []).map((c: { item_id: string }) => c.item_id)));
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const porDepartamento = useMemo(() => {
    const mapa = new Map<string, ItemRotina[]>();
    for (const item of itens) {
      if (!mapa.has(item.departamento)) mapa.set(item.departamento, []);
      mapa.get(item.departamento)!.push(item);
    }
    return mapa;
  }, [itens]);

  const toggleConcluido = async (item: ItemRotina) => {
    const feito = concluidosHoje.has(item.id);
    const next = new Set(concluidosHoje);
    if (feito) {
      next.delete(item.id);
      setConcluidosHoje(next);
      await supabase.from('ceo_rotina_conclusoes').delete().eq('item_id', item.id).eq('data', hoje);
    } else {
      next.add(item.id);
      setConcluidosHoje(next);
      await supabase.from('ceo_rotina_conclusoes').insert({ item_id: item.id, data: hoje });
    }
  };

  const adicionarItem = async () => {
    if (!novoTexto.trim() || salvando) return;
    setSalvando(true);
    const maiorOrdem = itens.reduce((max, i) => Math.max(max, i.ordem), 0);
    await supabase.from('ceo_rotina_itens').insert({ departamento: novoDepartamento, texto: novoTexto.trim(), ordem: maiorOrdem + 1 });
    setNovoTexto('');
    setSalvando(false);
    await carregar();
  };

  const excluirItem = async (id: string) => {
    await supabase.from('ceo_rotina_itens').update({ ativo: false }).eq('id', id);
    await carregar();
  };

  const moverItem = async (item: ItemRotina, direcao: 'cima' | 'baixo') => {
    const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem);
    const idx = ordenados.findIndex(i => i.id === item.id);
    const vizinhoIdx = direcao === 'cima' ? idx - 1 : idx + 1;
    if (vizinhoIdx < 0 || vizinhoIdx >= ordenados.length) return;
    const vizinho = ordenados[vizinhoIdx];
    await Promise.all([
      supabase.from('ceo_rotina_itens').update({ ordem: vizinho.ordem }).eq('id', item.id),
      supabase.from('ceo_rotina_itens').update({ ordem: item.ordem }).eq('id', vizinho.id),
    ]);
    await carregar();
  };

  const totalFeitos = concluidosHoje.size;
  const totalItens = itens.length;
  const meta = useMetaNovembro();
  const pctFaturamento = Math.min(Math.round((meta.faturamento / META_FATURAMENTO) * 100), 999);
  const pctMatriculas = Math.min(Math.round((meta.matriculas / META_MATRICULAS) * 100), 999);

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Rotina do CEO</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Passo a passo do dia — Financeiro primeiro, depois cada departamento. Marca
            conforme for fazendo; reseta sozinho a cada dia novo.
          </p>
        </header>

        <Card className="border-primary/40 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <SectionBar title={`Meta de ${META_MES_LABEL}`} icon={Target} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Faturamento</span>
                  <span className="font-semibold tabular-nums">
                    {meta.carregando ? '—' : formatReal(meta.faturamento)} / {formatReal(META_FATURAMENTO)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${meta.carregando ? 0 : Math.min(pctFaturamento, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{meta.carregando ? '—' : `${pctFaturamento}% da meta`}</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Matrículas</span>
                  <span className="font-semibold tabular-nums">
                    {meta.carregando ? '—' : meta.matriculas} / {META_MATRICULAS}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${meta.carregando ? 0 : Math.min(pctMatriculas, 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{meta.carregando ? '—' : `${pctMatriculas}% da meta (20 Ellen + 5 indicação/base)`}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
              Tráfego: orçamento de {formatReal(META_TRAFEGO)}/mês · Black Friday (Turma 48): 24-26/11 ·
              Semana do Despertar só nessa edição esse mês · Divã IDM e Sociedade IDM: vender/estruturar.
            </p>
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Feitos hoje" value={carregando ? '—' : `${totalFeitos} / ${totalItens}`} icon={CheckCircle2} tom={totalItens > 0 && totalFeitos === totalItens ? 'bom' : 'padrao'} />
        </section>

        {DEPARTAMENTOS.filter(d => porDepartamento.has(d.valor)).map(dep => (
          <Card key={dep.valor} className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title={dep.label} icon={ClipboardList} />
              <div className="space-y-2">
                {porDepartamento.get(dep.valor)!.map(item => {
                  const feito = concluidosHoje.has(item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5">
                      <Checkbox checked={feito} onCheckedChange={() => void toggleConcluido(item)} />
                      <span className={`flex-1 text-sm ${feito ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.texto}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void moverItem(item, 'cima')}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void moverItem(item, 'baixo')}><ArrowDown className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => void excluirItem(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed border-border/70">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Adicionar passo" icon={Plus} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={novoDepartamento} onValueChange={setNovoDepartamento}>
                <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map(d => <SelectItem key={d.valor} value={d.valor}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={novoTexto} onChange={e => setNovoTexto(e.target.value)} placeholder="O que fazer nesse passo" className="flex-1" />
              <Button onClick={() => void adicionarItem()} disabled={salvando || !novoTexto.trim()}>Adicionar</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
