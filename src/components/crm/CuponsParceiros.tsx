import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Ticket, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type ProdutoLite = { id: string; nome: string; parceiro_id: string; comissao_afiliado_padrao_pct: number | null; parceiros: { nome: string } | null };
type ParceiroLite = { id: string; nome: string };
type Cupom = {
  id: string; produto_id: string; parceiro_afiliado_id: string; codigo: string; comissao_pct: number | null; ativo: boolean;
  parceiros_produtos: { nome: string; parceiros: { nome: string } | null } | null;
  parceiros: { nome: string } | null;
};

const EMPTY_FORM = { produto_id: '', parceiro_afiliado_id: '', codigo: '', comissao_pct: '' };

function sugerirCodigo(nomeParceira: string, nomeProduto: string) {
  const base = (nomeParceira.split(' ')[0] || 'PARC').toUpperCase().replace(/[^A-Z]/g, '');
  const sufixo = (nomeProduto.split(' ')[0] || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return `${base}${sufixo}`.slice(0, 20);
}

export function CuponsParceiros() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [produtos, setProdutos] = useState<ProdutoLite[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const [cupRes, prodRes, parRes] = await Promise.all([
      supabase.from('parceiros_cupons' as any)
        .select('id, produto_id, parceiro_afiliado_id, codigo, comissao_pct, ativo, parceiros_produtos(nome, parceiros(nome)), parceiros(nome)')
        .order('codigo'),
      supabase.from('parceiros_produtos' as any).select('id, nome, parceiro_id, comissao_afiliado_padrao_pct, parceiros(nome)').eq('status', 'ativo').order('nome'),
      supabase.from('parceiros' as any).select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCupons((cupRes.data as any) || []);
    setProdutos((prodRes.data as any) || []);
    setParceiros((parRes.data as any) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const produtoSelecionado = produtos.find(p => p.id === form.produto_id);

  const aplicarSugestao = (produtoId: string, afiliadoId: string) => {
    const produto = produtos.find(p => p.id === produtoId);
    const afiliado = parceiros.find(p => p.id === afiliadoId);
    if (produto && afiliado) {
      setForm(f => ({ ...f, codigo: sugerirCodigo(afiliado.nome, produto.nome), comissao_pct: String(produto.comissao_afiliado_padrao_pct ?? '') }));
    }
  };

  const criarCupom = async () => {
    if (!form.produto_id || !form.parceiro_afiliado_id || !form.codigo.trim()) {
      toast.error('Selecione o produto, a parceira afiliada e informe o código.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('parceiros_cupons' as any).insert({
      produto_id: form.produto_id,
      parceiro_afiliado_id: form.parceiro_afiliado_id,
      codigo: form.codigo.trim().toUpperCase(),
      comissao_pct: form.comissao_pct ? Number(form.comissao_pct) : null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Já existe um cupom com esse código.' : `Erro ao criar cupom: ${error.message}`);
      return;
    }
    toast.success('Cupom criado.');
    setForm(EMPTY_FORM);
    load();
  };

  const toggleAtivo = async (cupom: Cupom) => {
    const { error } = await supabase.from('parceiros_cupons' as any).update({ ativo: !cupom.ativo }).eq('id', cupom.id);
    if (error) { toast.error(`Erro ao atualizar: ${error.message}`); return; }
    load();
  };

  const excluirCupom = async (cupom: Cupom) => {
    const { error } = await supabase.from('parceiros_cupons' as any).delete().eq('id', cupom.id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); return; }
    toast.success('Cupom removido.');
    load();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">Novo cupom de afiliada</p>
        <p className="text-xs text-muted-foreground">Qualquer parceira pode virar afiliada de qualquer produto ativo — inclusive de produtos que não são dela (rede cruzada).</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select value={form.produto_id} onValueChange={v => { setForm(f => ({ ...f, produto_id: v })); aplicarSugestao(v, form.parceiro_afiliado_id); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              {produtos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.parceiros?.nome})</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={form.parceiro_afiliado_id} onValueChange={v => { setForm(f => ({ ...f, parceiro_afiliado_id: v })); aplicarSugestao(form.produto_id, v); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Parceira afiliada" /></SelectTrigger>
            <SelectContent>
              {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="h-9" placeholder="Código do cupom" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} />
          <Input className="h-9" type="number" placeholder="Comissão (%)" value={form.comissao_pct} onChange={e => setForm(f => ({ ...f, comissao_pct: e.target.value }))} />
        </div>
        {produtoSelecionado && produtoSelecionado.parceiro_id === form.parceiro_afiliado_id && (
          <p className="text-xs text-amber-600">Essa parceira já é a dona deste produto — normalmente cupom de afiliada é pra promover produto de outra parceira.</p>
        )}
        <Button disabled={saving} onClick={criarCupom}><Plus className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Criar cupom'}</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : cupons.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum cupom criado ainda.</div>
      ) : (
        <div className="bg-white border border-border rounded-xl divide-y divide-border">
          {cupons.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <Ticket className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold text-foreground">{c.codigo}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.parceiros_produtos?.nome} ({c.parceiros_produtos?.parceiros?.nome}) · afiliada: {c.parceiros?.nome}
                  {c.comissao_pct != null && ` · ${c.comissao_pct}%`}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn('cursor-pointer', c.ativo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200')}
                onClick={() => toggleAtivo(c)}
              >
                {c.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => excluirCupom(c)} title="Excluir">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
