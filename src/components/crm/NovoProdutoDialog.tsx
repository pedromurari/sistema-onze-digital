import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

type ParceiroLite = { id: string; nome: string };

const EMPTY_FORM = {
  parceiro_id: '',
  nome: '',
  preco: '',
  descricao: '',
  comissao_idm_pct: '',
  comissao_parceiro_pct: '',
  comissao_afiliado_padrao_pct: '',
};

export function NovoProdutoDialog({ onCreated, scopedParceiroId }: { onCreated: () => void; scopedParceiroId?: string }) {
  const [open, setOpen] = useState(false);
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, parceiro_id: scopedParceiroId || '' });
  const [materialUrl, setMaterialUrl] = useState('');
  const [materialNome, setMaterialNome] = useState('');

  useEffect(() => {
    if (scopedParceiroId || !open) return;
    supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setParceiros((data as any) || []));
  }, [scopedParceiroId, open]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, parceiro_id: scopedParceiroId || '' });
    setMaterialUrl('');
    setMaterialNome('');
  };

  const handleMaterialUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('parceiros-materiais').upload(path, file, { upsert: true });
    setUploading(false);
    if (error) { toast.error(`Erro no upload: ${error.message}`); return; }
    const { data } = supabase.storage.from('parceiros-materiais').getPublicUrl(path);
    setMaterialUrl(data.publicUrl);
    setMaterialNome(file.name);
    toast.success('Material anexado.');
  };

  const criarProduto = async () => {
    if (!form.parceiro_id || !form.nome.trim()) {
      toast.error('Selecione a parceira e informe o nome do produto.');
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from('parceiros_produtos' as any) as any).insert({
      parceiro_id: form.parceiro_id,
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      preco: form.preco ? Number(form.preco) : null,
      comissao_idm_pct: form.comissao_idm_pct ? Number(form.comissao_idm_pct) : null,
      comissao_parceiro_pct: form.comissao_parceiro_pct ? Number(form.comissao_parceiro_pct) : null,
      comissao_afiliado_padrao_pct: form.comissao_afiliado_padrao_pct ? Number(form.comissao_afiliado_padrao_pct) : null,
      material_url: materialUrl || null,
      status: 'em_analise',
    });
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar produto: ${error.message}`); return; }
    toast.success('Produto cadastrado e enviado para análise.');
    resetForm();
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo produto</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo produto de parceria</DialogTitle>
          <DialogDescription>Cadastro vai para análise antes de ganhar o Selo IDM.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!scopedParceiroId && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Parceira</Label>
              <Select value={form.parceiro_id} onValueChange={v => setForm(f => ({ ...f, parceiro_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar parceira..." /></SelectTrigger>
                <SelectContent>
                  {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome do produto</Label>
            <Input className="h-9" placeholder="Ex: Mentoria Foco Total" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preço (R$)</Label>
              <Input className="h-9" placeholder="497,00" value={form.preco} onChange={e => setForm(f => ({ ...f, preco: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Comissão IDM (%)</Label>
              <Input className="h-9" placeholder="30" value={form.comissao_idm_pct} onChange={e => setForm(f => ({ ...f, comissao_idm_pct: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Comissão parceira (%)</Label>
              <Input className="h-9" placeholder="70" value={form.comissao_parceiro_pct} onChange={e => setForm(f => ({ ...f, comissao_parceiro_pct: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Comissão afiliada padrão (%)</Label>
              <Input className="h-9" placeholder="20" value={form.comissao_afiliado_padrao_pct} onChange={e => setForm(f => ({ ...f, comissao_afiliado_padrao_pct: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Textarea rows={2} placeholder="Resumo do produto para a página de vendas" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs h-9 px-3 border border-border rounded-md cursor-pointer hover:bg-muted transition-colors">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {materialNome || 'Anexar material'}
            <input type="file" className="hidden" onChange={handleMaterialUpload} disabled={uploading} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={criarProduto}>{saving ? 'Salvando...' : 'Enviar para análise'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
