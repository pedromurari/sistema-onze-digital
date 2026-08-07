import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';

interface BonusTipo {
  id: string;
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
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bonus_tipos')
      .select('id, nome, ativo, ordem')
      .order('ordem', { ascending: true });
    setBonusTipos((data as BonusTipo[]) || []);
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

        <div className="space-y-1.5 max-h-72 overflow-y-auto mt-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : bonusTipos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum bônus cadastrado ainda.</p>
          ) : bonusTipos.map(b => (
            <div key={b.id} className={`flex items-center gap-2 rounded-md border border-border px-2 py-1.5 ${!b.ativo ? 'opacity-60' : ''}`}>
              <Input
                defaultValue={b.nome}
                className="h-7 text-sm flex-1"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.nome) renomear(b.id, v); }}
              />
              <span className="text-[11px] text-muted-foreground shrink-0">{b.ativo ? 'Ativo' : 'Inativo'}</span>
              <Switch checked={b.ativo} onCheckedChange={v => toggleAtivo(b.id, v)} />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
