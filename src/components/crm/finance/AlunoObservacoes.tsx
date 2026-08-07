import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';

interface AlunoObservacao {
  id: string;
  texto: string;
  status: 'pendente' | 'resolvido';
  created_at: string;
  resolvido_em: string | null;
}

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AlunoObservacoes({ alunoId, onLoaded }: {
  alunoId: string;
  onLoaded?: (observacoes: AlunoObservacao[]) => void;
}) {
  const { user } = useAuth();
  const [observacoes, setObservacoes] = useState<AlunoObservacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoTexto, setNovoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [mostrarResolvidas, setMostrarResolvidas] = useState(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('aluno_observacoes')
      .select('id, texto, status, created_at, resolvido_em')
      .eq('aluno_id', alunoId)
      .order('created_at', { ascending: false });
    const lista = (data as AlunoObservacao[]) || [];
    setObservacoes(lista);
    setLoading(false);
    onLoadedRef.current?.(lista);
  }, [alunoId]);

  useEffect(() => { if (alunoId) carregar(); }, [alunoId, carregar]);

  const adicionar = async () => {
    const texto = novoTexto.trim();
    if (!texto) return;
    setSalvando(true);
    const { error } = await supabase
      .from('aluno_observacoes')
      .insert({ aluno_id: alunoId, texto, criado_por: user?.id ?? null });
    setSalvando(false);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    setNovoTexto('');
    toast({ title: 'Observação adicionada!' });
    carregar();
  };

  const resolver = async (id: string) => {
    setResolvendoId(id);
    const { error } = await supabase
      .from('aluno_observacoes')
      .update({ status: 'resolvido', resolvido_por: user?.id ?? null, resolvido_em: new Date().toISOString() })
      .eq('id', id);
    setResolvendoId(null);
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    carregar();
  };

  const pendentes = observacoes.filter(o => o.status === 'pendente');
  const resolvidas = observacoes.filter(o => o.status === 'resolvido');

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observações</p>
      <div className="flex gap-2 mb-3">
        <Textarea
          value={novoTexto}
          onChange={e => setNovoTexto(e.target.value)}
          placeholder="Nova observação sobre contrato, cobrança ou atendimento..."
          className="min-h-16 text-sm"
        />
        <Button size="sm" variant="outline" className="self-end shrink-0" disabled={!novoTexto.trim() || salvando} onClick={adicionar}>
          Adicionar
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-2">
          {pendentes.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma observação pendente.</p>
          )}
          {pendentes.map(o => (
            <div key={o.id} className="flex items-start justify-between gap-2 rounded-md border border-border bg-white px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{o.texto}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">criado em {fmtDataHora(o.created_at)}</p>
              </div>
              <Button
                size="sm" variant="outline" className="gap-1 text-xs h-7 shrink-0"
                disabled={resolvendoId === o.id}
                onClick={() => resolver(o.id)}
              >
                <Check size={12} />Solucionado
              </Button>
            </div>
          ))}

          {resolvidas.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMostrarResolvidas(v => !v)}
              >
                {mostrarResolvidas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Mostrar resolvidas ({resolvidas.length})
              </button>
              {mostrarResolvidas && (
                <div className="space-y-2 mt-2">
                  {resolvidas.map(o => (
                    <div key={o.id} className="rounded-md border border-border bg-muted/20 px-3 py-2 opacity-70">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{o.texto}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        criado em {fmtDataHora(o.created_at)}
                        {o.resolvido_em && <> · resolvido em {fmtDataHora(o.resolvido_em)}</>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
