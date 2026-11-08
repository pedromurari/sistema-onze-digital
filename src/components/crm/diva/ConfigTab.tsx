import { useEffect, useState } from 'react';
import { Settings, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionBar } from '@/components/crm/ui/premium';

interface RedeSocial { label: string; url: string; }
interface Depoimento { nome: string; texto: string; video_url: string; }
interface DivaConfig {
  video_captura_url: string | null;
  whatsapp_contato: string | null;
  redes_sociais: RedeSocial[];
  depoimentos: Depoimento[];
}

const VAZIO: DivaConfig = { video_captura_url: '', whatsapp_contato: '', redes_sociais: [], depoimentos: [] };

export function ConfigTab() {
  const [config, setConfig] = useState<DivaConfig>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data } = await supabase.from('diva_config' as never)
      .select('video_captura_url, whatsapp_contato, redes_sociais, depoimentos').eq('id', true).maybeSingle();
    const row = data as DivaConfig | null;
    setConfig(row ? {
      video_captura_url: row.video_captura_url ?? '',
      whatsapp_contato: row.whatsapp_contato ?? '',
      redes_sociais: row.redes_sociais ?? [],
      depoimentos: row.depoimentos ?? [],
    } : VAZIO);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from('diva_config' as never)
      .update({
        video_captura_url: config.video_captura_url || null,
        whatsapp_contato: config.whatsapp_contato || null,
        redes_sociais: config.redes_sociais.filter(r => r.label.trim() && r.url.trim()),
        depoimentos: config.depoimentos.filter(d => d.nome.trim() && d.texto.trim()),
      } as never)
      .eq('id', true as never);
    setSalvando(false);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    toast.success('Página /diva atualizada.');
    await carregar();
  };

  if (carregando) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Página /diva — vídeo e contato" icon={Settings} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">URL do vídeo de apresentação</label>
              <Input placeholder="https://..." value={config.video_captura_url ?? ''} onChange={e => setConfig(c => ({ ...c, video_captura_url: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">WhatsApp de contato (rodapé, formato 55DDDNÚMERO)</label>
              <Input placeholder="5511930439385" value={config.whatsapp_contato ?? ''} onChange={e => setConfig(c => ({ ...c, whatsapp_contato: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Redes sociais (rodapé)" icon={Settings} />
          <div className="space-y-2">
            {config.redes_sociais.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <Input placeholder="Instagram" value={r.label} onChange={e => setConfig(c => ({ ...c, redes_sociais: c.redes_sociais.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} />
                <Input placeholder="https://instagram.com/..." value={r.url} onChange={e => setConfig(c => ({ ...c, redes_sociais: c.redes_sociais.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} />
                <Button variant="ghost" size="icon" onClick={() => setConfig(c => ({ ...c, redes_sociais: c.redes_sociais.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setConfig(c => ({ ...c, redes_sociais: [...c.redes_sociais, { label: '', url: '' }] }))}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar rede social
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <SectionBar title="Depoimentos" icon={Settings} />
          <p className="text-xs text-muted-foreground">Texto é obrigatório pra aparecer na página; vídeo é opcional (se vazio, mostra só o texto).</p>
          <div className="space-y-3">
            {config.depoimentos.map((d, i) => (
              <div key={i} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Nome do cliente" value={d.nome} onChange={e => setConfig(c => ({ ...c, depoimentos: c.depoimentos.map((x, j) => j === i ? { ...x, nome: e.target.value } : x) }))} />
                  <Button variant="ghost" size="icon" onClick={() => setConfig(c => ({ ...c, depoimentos: c.depoimentos.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <Textarea placeholder="Texto do depoimento" value={d.texto} onChange={e => setConfig(c => ({ ...c, depoimentos: c.depoimentos.map((x, j) => j === i ? { ...x, texto: e.target.value } : x) }))} />
                <Input placeholder="URL do vídeo (opcional)" value={d.video_url} onChange={e => setConfig(c => ({ ...c, depoimentos: c.depoimentos.map((x, j) => j === i ? { ...x, video_url: e.target.value } : x) }))} />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setConfig(c => ({ ...c, depoimentos: [...c.depoimentos, { nome: '', texto: '', video_url: '' }] }))}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar depoimento
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => void salvar()} disabled={salvando}>
        <Save className="h-4 w-4 mr-1.5" /> {salvando ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
}
