import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';

interface BonusTipo {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

interface BonusTurma {
  id: string;
  bonus_id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export function BonusConfigModal({ open, onOpenChange, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [bonusTipos, setBonusTipos] = useState<BonusTipo[]>([]);
  const [bonusTurmas, setBonusTurmas] = useState<BonusTurma[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [novaTurma, setNovaTurma] = useState<Record<string, string>>({});

  const carregar = async () => {
    setLoading(true);
    const [{ data: tipos }, { data: edicoes }] = await Promise.all([
      supabase.from('bonus_tipos').select('id, nome, ativo, ordem').order('ordem', { ascending: true }),
      supabase.from('bonus_turmas').select('id, bonus_id, nome, ativo, ordem').order('ordem', { ascending: true }),
    ]);
    setBonusTipos((tipos as BonusTipo[]) || []);
    setBonusTurmas((edicoes as BonusTurma[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (open) carregar(); }, [open]);

  const adicionar = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    const maxOrdem = bonusTipos.reduce((max, b) => Math.max(max, b.ordem), 0);
    const { error } = await supabase.from('bonus_tipos').insert({ nome, ativo: true, ordem: maxOrdem + 1 });
    setSalvando(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setNovoNome('');
    await carregar();
    onChanged();
  };

  const renomear = async (id: string, nome: string) => {
    const { error } = await supabase.from('bonus_tipos').update({ nome }).eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    onChanged();
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from('bonus_tipos').update({ ativo }).eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setBonusTipos(prev => prev.map(b => b.id === id ? { ...b, ativo } : b));
    onChanged();
  };

  // ── Turmas (edições) de cada bônus ──────────────────────────────────────────
  // Cada rodada do bônus tem seu próprio grupo, então o que importa registrar no
  // aluno é em qual delas ele entrou.

  const adicionarTurma = async (bonusId: string) => {
    const nome = (novaTurma[bonusId] || '').trim();
    if (!nome) return;
    const maxOrdem = bonusTurmas.filter(t => t.bonus_id === bonusId).reduce((max, t) => Math.max(max, t.ordem), 0);
    const { error } = await supabase.from('bonus_turmas').insert({ bonus_id: bonusId, nome, ativo: true, ordem: maxOrdem + 1 });
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setNovaTurma(prev => ({ ...prev, [bonusId]: '' }));
    await carregar();
    onChanged();
  };

  const renomearTurma = async (id: string, nome: string) => {
    const { error } = await supabase.from('bonus_turmas').update({ nome }).eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setBonusTurmas(prev => prev.map(t => t.id === id ? { ...t, nome } : t));
    onChanged();
  };

  const toggleTurmaAtiva = async (id: string, ativo: boolean) => {
    const { error } = await supabase.from('bonus_turmas').update({ ativo }).eq('id', id);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setBonusTurmas(prev => prev.map(t => t.id === id ? { ...t, ativo } : t));
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar bônus</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome do bônus (ex: E-book X)"
            className="h-8 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
          />
          <Button size="sm" variant="outline" className="gap-1 shrink-0" disabled={!novoNome.trim() || salvando} onClick={adicionar}>
            <Plus size={14} />Adicionar
          </Button>
        </div>

        <div className="space-y-1.5 max-h-96 overflow-y-auto mt-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : bonusTipos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum bônus cadastrado ainda.</p>
          ) : bonusTipos.map(b => {
            const edicoes = bonusTurmas.filter(t => t.bonus_id === b.id);
            const aberto = !!expandido[b.id];
            return (
              <div key={b.id} className={`rounded-md border border-border ${!b.ativo ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <Input
                    defaultValue={b.nome}
                    className="h-7 text-sm flex-1"
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.nome) renomear(b.id, v); }}
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">{b.ativo ? 'Ativo' : 'Inativo'}</span>
                  <Switch checked={b.ativo} onCheckedChange={v => toggleAtivo(b.id, v)} />
                </div>

                <button
                  type="button"
                  className="flex items-center gap-1 px-2 pb-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpandido(prev => ({ ...prev, [b.id]: !aberto }))}
                >
                  {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Turmas do bônus ({edicoes.length})
                </button>

                {aberto && (
                  <div className="px-2 pb-2 space-y-1.5 border-t border-border pt-2">
                    {edicoes.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Nenhuma turma ainda — a primeira já pode ser escolhida na ficha do aluno.</p>
                    )}
                    {edicoes.map(t => (
                      <div key={t.id} className={`flex items-center gap-2 ${!t.ativo ? 'opacity-60' : ''}`}>
                        <Input
                          defaultValue={t.nome}
                          className="h-7 text-xs flex-1"
                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.nome) renomearTurma(t.id, v); }}
                        />
                        <Switch checked={t.ativo} onCheckedChange={v => toggleTurmaAtiva(t.id, v)} />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Input
                        value={novaTurma[b.id] || ''}
                        onChange={e => setNovaTurma(prev => ({ ...prev, [b.id]: e.target.value }))}
                        placeholder="Nova turma (ex: #07)"
                        className="h-7 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') adicionarTurma(b.id); }}
                      />
                      <Button size="sm" variant="outline" className="gap-1 shrink-0 h-7 text-xs" disabled={!(novaTurma[b.id] || '').trim()} onClick={() => adicionarTurma(b.id)}>
                        <Plus size={12} />Add
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
