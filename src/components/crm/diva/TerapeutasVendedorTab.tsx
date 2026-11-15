import { useEffect, useState } from 'react';
import { Search, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionBar } from '@/components/crm/ui/premium';
import { FichaTerapeutaDialog } from './FichaTerapeutaDialog';

/**
 * Painel de links de venda do Divã IDM pra vendedora -- aba "Divã" dentro
 * do CRM Time Comercial. Só-leitura: busca a view
 * diva_terapeutas_links_vendedor (expõe nome/especialidade/foto/plano/
 * preço, nunca Pix/bio/status interno). O olho abre a mesma
 * FichaTerapeutaDialog usada no admin, em modo="vendedor".
 */

interface TerapeutaResumo { terapeuta_id: string; nome: string; especialidade: string | null; foto_url: string | null; }

export function TerapeutasVendedorTab() {
  const [terapeutas, setTerapeutas] = useState<TerapeutaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCarregando(true);
      const { data } = await supabase
        .from('diva_terapeutas_links_vendedor' as never)
        .select('terapeuta_id, nome, especialidade, foto_url');
      const vistos = new Set<string>();
      const lista: TerapeutaResumo[] = [];
      for (const linha of (data as unknown as TerapeutaResumo[]) ?? []) {
        if (vistos.has(linha.terapeuta_id)) continue;
        vistos.add(linha.terapeuta_id);
        lista.push(linha);
      }
      lista.sort((a, b) => a.nome.localeCompare(b.nome));
      setTerapeutas(lista);
      setCarregando(false);
    })();
  }, []);

  const filtrados = terapeutas.filter(t => !busca.trim() || t.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionBar title={`Terapeutas Divã IDM (${carregando ? '—' : filtrados.length})`} />
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique no olho pra ver e copiar o link de venda de cada plano desse terapeuta.
          </p>

          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum terapeuta com plano ativo ainda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtrados.map(t => (
                <div key={t.terapeuta_id} className="relative rounded-xl border border-border/60 p-4 flex flex-col items-center gap-2 text-center hover:border-primary/40 transition-colors">
                  <button type="button" title="Ver links de venda" className="absolute top-2 right-2 text-muted-foreground hover:text-primary transition-colors" onClick={() => setFichaAberta(t.terapeuta_id)}>
                    <Eye className="h-4 w-4" />
                  </button>
                  {t.foto_url ? (
                    <img src={t.foto_url} alt={t.nome} className="h-14 w-14 rounded-full object-cover border border-border/60" />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-base text-muted-foreground">{t.nome.charAt(0).toUpperCase()}</div>
                  )}
                  <div>
                    <p className="font-medium text-sm leading-tight">{t.nome}</p>
                    {t.especialidade && <p className="text-xs text-muted-foreground">{t.especialidade}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {fichaAberta && (
        <FichaTerapeutaDialog terapeutaId={fichaAberta} modo="vendedor" onClose={() => setFichaAberta(null)} />
      )}
    </div>
  );
}
