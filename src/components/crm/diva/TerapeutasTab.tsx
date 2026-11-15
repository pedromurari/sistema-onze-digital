import { useEffect, useState } from 'react';
import { Plus, Search, Eye, CheckCircle2, PauseCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';
import { FichaTerapeutaDialog } from './FichaTerapeutaDialog';

type StatusTerapeuta = 'em_analise' | 'aprovado' | 'pausado' | 'reprovado';

interface Terapeuta {
  id: string; nome: string; especialidade: string | null; foto_url: string | null; status: StatusTerapeuta;
}

const STATUS_CONFIG: Record<StatusTerapeuta, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  aprovado:   { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pausado:    { label: 'Pausado', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: PauseCircle },
  reprovado:  { label: 'Reprovado', className: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export function TerapeutasTab() {
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [bio, setBio] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase
      .from('diva_terapeutas')
      .select('id, nome, especialidade, foto_url, status')
      .order('created_at', { ascending: false });
    setTerapeutas((data as Terapeuta[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const adicionar = async () => {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    await supabase.from('diva_terapeutas').insert({
      nome: nome.trim(),
      especialidade: especialidade.trim() || null,
      bio: bio.trim() || null,
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      chave_pix: chavePix.trim() || null,
      foto_url: fotoUrl.trim() || null,
      status: 'em_analise',
    });
    setNome(''); setEspecialidade(''); setBio(''); setWhatsapp(''); setEmail(''); setChavePix(''); setFotoUrl('');
    setSalvando(false);
    await carregar();
  };

  const terapeutasFiltrados = terapeutas.filter(t =>
    !busca.trim() || t.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionBar title={`Terapeutas (${carregando ? '—' : terapeutasFiltrados.length})`} />
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : terapeutasFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum terapeuta encontrado.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {terapeutasFiltrados.map(t => {
                const cfg = STATUS_CONFIG[t.status];
                return (
                  <div key={t.id} className="relative rounded-xl border border-border/60 p-4 flex flex-col items-center gap-2 text-center hover:border-primary/40 transition-colors">
                    <button
                      type="button"
                      title="Ver ficha completa"
                      className="absolute top-2 right-2 text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => setFichaAberta(t.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {t.foto_url ? (
                      <img src={t.foto_url} alt={t.nome} className="h-14 w-14 rounded-full object-cover border border-border/60" />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center text-base text-muted-foreground">
                        {t.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm leading-tight">{t.nome}</p>
                      {t.especialidade && <p className="text-xs text-muted-foreground">{t.especialidade}</p>}
                    </div>
                    <Badge variant="outline" className={`${cfg.className} text-[10px]`}>{cfg.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-border/70">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Credenciar terapeuta" icon={Plus} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
            <Input placeholder="Especialidade (ex: Psicanálise)" value={especialidade} onChange={e => setEspecialidade(e.target.value)} />
            <Input placeholder="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
            <Input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
            <Input placeholder="Chave PIX" value={chavePix} onChange={e => setChavePix(e.target.value)} />
            <Input placeholder="URL da foto (opcional)" value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} />
          </div>
          <Textarea placeholder="Bio curta (aparece no painel público quando aprovado)" value={bio} onChange={e => setBio(e.target.value)} />
          <Button onClick={() => void adicionar()} disabled={salvando || !nome.trim()}>Cadastrar (entra como "Em análise")</Button>
        </CardContent>
      </Card>

      {fichaAberta && (
        <FichaTerapeutaDialog
          terapeutaId={fichaAberta}
          modo="admin"
          onClose={() => setFichaAberta(null)}
          onAtualizado={() => void carregar()}
        />
      )}
    </div>
  );
}
