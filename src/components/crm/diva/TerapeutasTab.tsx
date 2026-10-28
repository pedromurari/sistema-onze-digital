import { useEffect, useState } from 'react';
import { Plus, CheckCircle2, PauseCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SectionBar } from '@/components/crm/ui/premium';

type StatusTerapeuta = 'em_analise' | 'aprovado' | 'pausado' | 'reprovado';

interface Terapeuta {
  id: string; nome: string; especialidade: string | null; bio: string | null;
  whatsapp: string | null; email: string | null; status: StatusTerapeuta; aluno_id: string | null;
}

const STATUS_CONFIG: Record<StatusTerapeuta, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  em_analise: { label: 'Em análise', className: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  aprovado:   { label: 'Aprovado (aparece em /diva)', className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pausado:    { label: 'Pausado', className: 'bg-gray-100 text-gray-700 border-gray-200', icon: PauseCircle },
  reprovado:  { label: 'Reprovado', className: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export function TerapeutasTab() {
  const [terapeutas, setTerapeutas] = useState<Terapeuta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [bio, setBio] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('diva_terapeutas').select('*').order('created_at', { ascending: false });
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
      status: 'em_analise',
    });
    setNome(''); setEspecialidade(''); setBio(''); setWhatsapp(''); setEmail('');
    setSalvando(false);
    await carregar();
  };

  const mudarStatus = async (id: string, status: StatusTerapeuta) => {
    await supabase.from('diva_terapeutas').update({ status }).eq('id', id);
    await carregar();
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title={`Terapeutas (${carregando ? '—' : terapeutas.length})`} />
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : terapeutas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum terapeuta cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {terapeutas.map(t => {
                const cfg = STATUS_CONFIG[t.status];
                return (
                  <div key={t.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-sm">{t.nome}</span>
                        {t.especialidade && <span className="text-xs text-muted-foreground"> — {t.especialidade}</span>}
                      </div>
                      <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
                    </div>
                    {t.bio && <p className="text-xs text-muted-foreground">{t.bio}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {t.status !== 'aprovado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus(t.id, 'aprovado')}>Aprovar</Button>}
                      {t.status !== 'pausado' && <Button size="sm" variant="outline" onClick={() => void mudarStatus(t.id, 'pausado')}>Pausar</Button>}
                      {t.status !== 'reprovado' && <Button size="sm" variant="outline" className="text-destructive" onClick={() => void mudarStatus(t.id, 'reprovado')}>Reprovar</Button>}
                    </div>
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
          </div>
          <Textarea placeholder="Bio curta (aparece no painel público quando aprovado)" value={bio} onChange={e => setBio(e.target.value)} />
          <Button onClick={() => void adicionar()} disabled={salvando || !nome.trim()}>Cadastrar (entra como "Em análise")</Button>
        </CardContent>
      </Card>
    </div>
  );
}
