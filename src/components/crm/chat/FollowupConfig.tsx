import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, Image, Music, Video, MessageSquare, GripVertical } from 'lucide-react';

/**
 * Follow-up automático do vendedor: sequência de mensagens que dispara sozinha
 * quando um lead fica sem responder — cada vendedor(a) configura a própria
 * (tempos, tipo de mídia, conteúdo), com filtro opcional por produto e por
 * lançamento. Quem manda de verdade é o cron `followup-vendedor-enviar`, pela
 * instância Evolution do próprio vendedor; aqui é só a configuração.
 */

interface FollowupPasso {
  id: string;
  sequencia_id: string;
  ordem: number;
  intervalo_horas: number;
  tipo_midia: 'texto' | 'imagem' | 'imagem_legenda' | 'audio' | 'video';
  texto: string | null;
  media_url: string | null;
}

interface FollowupSequencia {
  id: string;
  nome: string;
  produto: string | null;
  lancamento_id: string | null;
  ativo: boolean;
}

const TIPOS_MIDIA: { key: FollowupPasso['tipo_midia']; label: string; icon: React.ElementType }[] = [
  { key: 'texto', label: 'Texto', icon: MessageSquare },
  { key: 'imagem', label: 'Só imagem', icon: Image },
  { key: 'imagem_legenda', label: 'Imagem + legenda', icon: Image },
  { key: 'audio', label: 'Áudio', icon: Music },
  { key: 'video', label: 'Vídeo', icon: Video },
];

const PRODUTOS = [
  { value: '__todos__', label: 'Todos os produtos' },
  { value: 'psicanalise', label: 'Psicanálise' },
  { value: 'numerologia', label: 'Numerologia' },
  { value: 'pnl', label: 'PNL' },
];

function PassoCard({ passo, onChange, onRemove }: {
  passo: FollowupPasso;
  onChange: (patch: Partial<FollowupPasso>) => void;
  onRemove: () => void;
}) {
  const precisaMedia = passo.tipo_midia !== 'texto';
  const precisaTexto = passo.tipo_midia === 'texto' || passo.tipo_midia === 'imagem_legenda';
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <GripVertical size={13} /> Passo {passo.ordem}
        </div>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock size={10} /> Sem resposta há
          </label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number" min={1} value={passo.intervalo_horas}
              onChange={e => onChange({ intervalo_horas: Math.max(1, Number(e.target.value) || 1) })}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">horas</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipo</label>
          <Select value={passo.tipo_midia} onValueChange={(v) => onChange({ tipo_midia: v as FollowupPasso['tipo_midia'] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_MIDIA.map(t => <SelectItem key={t.key} value={t.key} className="text-xs">{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {precisaMedia && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">URL da mídia</label>
          <Input
            value={passo.media_url ?? ''}
            onChange={e => onChange({ media_url: e.target.value })}
            placeholder="https://…"
            className="h-8 text-xs font-mono"
          />
        </div>
      )}

      {precisaTexto && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {passo.tipo_midia === 'imagem_legenda' ? 'Legenda' : 'Mensagem'}
          </label>
          <Textarea
            value={passo.texto ?? ''}
            onChange={e => onChange({ texto: e.target.value })}
            rows={2}
            className="text-xs resize-y"
            placeholder="Oi {{nome}}, ainda dá tempo de garantir sua vaga…"
          />
        </div>
      )}
    </div>
  );
}

function SequenciaCard({ seq, passos, lancamentos, onMudou }: {
  seq: FollowupSequencia;
  passos: FollowupPasso[];
  lancamentos: { id: string; nome: string }[];
  onMudou: () => void;
}) {
  const [nome, setNome] = useState(seq.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);

  const salvarCampo = async (patch: Partial<FollowupSequencia>) => {
    const { error } = await supabase.from('followup_sequencias').update(patch).eq('id', seq.id);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    onMudou();
  };

  const handleAddPasso = async () => {
    const proximaOrdem = (passos[passos.length - 1]?.ordem ?? 0) + 1;
    const { error } = await supabase.from('followup_passos').insert({
      sequencia_id: seq.id, ordem: proximaOrdem, intervalo_horas: 24, tipo_midia: 'texto', texto: '',
    });
    if (error) { toast.error(`Erro ao adicionar passo: ${error.message}`); return; }
    onMudou();
  };

  const handleUpdatePasso = async (passo: FollowupPasso, patch: Partial<FollowupPasso>) => {
    const { error } = await supabase.from('followup_passos').update(patch).eq('id', passo.id);
    if (error) { toast.error(`Erro ao salvar passo: ${error.message}`); return; }
    onMudou();
  };

  const handleRemovePasso = async (passo: FollowupPasso) => {
    const { error } = await supabase.from('followup_passos').delete().eq('id', passo.id);
    if (error) { toast.error(`Erro ao remover passo: ${error.message}`); return; }
    onMudou();
  };

  const handleExcluirSequencia = async () => {
    if (!confirm(`Excluir a sequência "${seq.nome}"? Os passos dela somem junto.`)) return;
    const { error } = await supabase.from('followup_sequencias').delete().eq('id', seq.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    onMudou();
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-white">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={nome}
          onChange={e => setNome(e.target.value)}
          onBlur={async () => {
            if (nome.trim() === seq.nome) return;
            setSalvandoNome(true);
            await salvarCampo({ nome: nome.trim() || 'Follow-up' });
            setSalvandoNome(false);
          }}
          disabled={salvandoNome}
          className="h-8 text-sm font-semibold flex-1 min-w-[140px] border-0 shadow-none px-0 focus-visible:ring-0"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{seq.ativo ? 'Ativa' : 'Pausada'}</span>
          <Switch checked={seq.ativo} onCheckedChange={(v) => salvarCampo({ ativo: v })} />
        </div>
        <button onClick={handleExcluirSequencia} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Produto</label>
          <Select value={seq.produto ?? '__todos__'} onValueChange={(v) => salvarCampo({ produto: v === '__todos__' ? null : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUTOS.map(p => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Lançamento</label>
          <Select value={seq.lancamento_id ?? '__todos__'} onValueChange={(v) => salvarCampo({ lancamento_id: v === '__todos__' ? null : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__" className="text-xs">Todos os lançamentos</SelectItem>
              {lancamentos.map(l => <SelectItem key={l.id} value={l.id} className="text-xs">{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {passos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum passo ainda — adicione o primeiro.</p>
        ) : passos.map(p => (
          <PassoCard key={p.id} passo={p} onChange={(patch) => handleUpdatePasso(p, patch)} onRemove={() => handleRemovePasso(p)} />
        ))}
        <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={handleAddPasso}>
          <Plus size={13} /> Adicionar passo
        </Button>
      </div>
    </div>
  );
}

export function FollowupConfig({ vendedorId }: { vendedorId: string }) {
  const [sequencias, setSequencias] = useState<FollowupSequencia[] | null>(null);
  const [passosPorSequencia, setPassosPorSequencia] = useState<Record<string, FollowupPasso[]>>({});
  const [lancamentos, setLancamentos] = useState<{ id: string; nome: string }[]>([]);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const { data: seqs } = await supabase
      .from('followup_sequencias')
      .select('id, nome, produto, lancamento_id, ativo')
      .eq('vendedor_id', vendedorId)
      .order('created_at', { ascending: true });
    const lista = (seqs ?? []) as FollowupSequencia[];
    setSequencias(lista);

    if (lista.length) {
      const { data: passos } = await supabase
        .from('followup_passos')
        .select('id, sequencia_id, ordem, intervalo_horas, tipo_midia, texto, media_url')
        .in('sequencia_id', lista.map(s => s.id))
        .order('ordem', { ascending: true });
      const porSeq: Record<string, FollowupPasso[]> = {};
      for (const p of (passos ?? []) as FollowupPasso[]) {
        (porSeq[p.sequencia_id] ??= []).push(p);
      }
      setPassosPorSequencia(porSeq);
    } else {
      setPassosPorSequencia({});
    }
  }, [vendedorId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('lancamentos').select('id, nome').order('created_at', { ascending: false }).limit(30);
      if (data) setLancamentos(data as { id: string; nome: string }[]);
    })();
  }, []);

  const handleCriarSequencia = async () => {
    setCriando(true);
    const { error } = await supabase.from('followup_sequencias').insert({
      vendedor_id: vendedorId, nome: 'Follow-up', ativo: false,
    });
    setCriando(false);
    if (error) { toast.error(`Erro ao criar: ${error.message}`); return; }
    carregar();
  };

  if (sequencias === null) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Follow-up automático</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dispara sozinho quando o lead fica sem responder. Cada sequência pode valer pra todo mundo ou só pra um produto/lançamento.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={handleCriarSequencia} disabled={criando}>
          <Plus size={13} /> Nova sequência
        </Button>
      </div>

      {sequencias.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhuma sequência configurada ainda.</p>
      ) : (
        <div className="space-y-3">
          {sequencias.map(seq => (
            <SequenciaCard
              key={seq.id}
              seq={seq}
              passos={passosPorSequencia[seq.id] ?? []}
              lancamentos={lancamentos}
              onMudou={carregar}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
