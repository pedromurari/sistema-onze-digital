import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Grupo = { id: string; nome: string };

export function useAvisoConfig() {
  return useQuery({
    queryKey: ['aviso-meet-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('aviso_meet_config').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });
}

export function AvisosGrupoDialog({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const queryClient = useQueryClient();
  const config = useAvisoConfig();
  const [instancia, setInstancia] = useState('');
  const [antecedencia, setAntecedencia] = useState('20');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [erroGrupos, setErroGrupos] = useState('');
  const turmas = useQuery({
    queryKey: ['aviso-turmas-grupos'],
    enabled: aberto,
    queryFn: async () => {
      const { data, error } = await supabase.from('turmas').select('id, nome, grupo_whatsapp_jid').not('id', 'is', null).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!config.data) return;
    setInstancia(config.data.instance_name ?? '');
    setAntecedencia(String(config.data.antecedencia_minutos));
    setMensagem(config.data.mensagem_modelo);
  }, [config.data]);

  async function chamarFuncao(corpo: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke('turma-grupos-whatsapp', { body: corpo });
    if (error || !data) throw new Error('Falha ao falar com o servidor.');
    if (data.erro) throw new Error(data.erro);
    return data;
  }

  async function carregarGrupos() {
    setCarregandoGrupos(true);
    setErroGrupos('');
    try {
      await supabase.from('aviso_meet_config').update({ instance_name: instancia || null }).eq('id', 1);
      const data = await chamarFuncao({ acao: 'listar' });
      setGrupos(data.grupos);
    } catch (e) {
      setErroGrupos(e instanceof Error ? e.message : 'Erro ao buscar grupos.');
    } finally {
      setCarregandoGrupos(false);
    }
  }

  async function salvarConfig(ativo: boolean) {
    setSalvando(true);
    const { error } = await supabase.from('aviso_meet_config').update({
      ativo,
      instance_name: instancia || null,
      antecedencia_minutos: Number(antecedencia) || 20,
      mensagem_modelo: mensagem,
    }).eq('id', 1);
    setSalvando(false);
    if (error) return toast.error('Não foi possível salvar.');
    toast.success(ativo ? 'Envio ligado.' : 'Configuração salva.');
    void queryClient.invalidateQueries({ queryKey: ['aviso-meet-config'] });
  }

  async function vincularGrupo(turmaId: string, grupoId: string) {
    try {
      await chamarFuncao({ acao: 'salvar', turma_id: turmaId, grupo_jid: grupoId });
      void turmas.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível vincular.');
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) fechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Avisos no grupo da turma</DialogTitle>
          <DialogDescription>Envia o link do Meet no grupo de cada turma antes da aula. Fica desligado até você ligar.</DialogDescription>
        </DialogHeader>

        {config.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="aviso-instancia">Instância do WhatsApp</Label>
              <Input id="aviso-instancia" value={instancia} onChange={e => setInstancia(e.target.value)} placeholder="Ex: Pedro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aviso-antecedencia">Minutos antes da aula</Label>
              <Input id="aviso-antecedencia" inputMode="numeric" value={antecedencia} onChange={e => setAntecedencia(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aviso-mensagem">Modelo da mensagem</Label>
            <Textarea id="aviso-mensagem" rows={6} value={mensagem} onChange={e => setMensagem(e.target.value)} />
            <p className="text-xs text-muted-foreground">Variáveis: {'{{turma}}'}, {'{{modulo}}'}, {'{{hora}}'}, {'{{link_meet}}'}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Envio automático</p>
              <p className="text-xs text-muted-foreground">{config.data?.ativo ? 'Ligado' : 'Desligado'}</p>
            </div>
            <Switch checked={config.data?.ativo ?? false} disabled={salvando} onCheckedChange={(v) => void salvarConfig(v)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Grupo de cada turma</p>
              <Button size="sm" variant="outline" disabled={carregandoGrupos} onClick={() => void carregarGrupos()}>
                {carregandoGrupos ? 'Buscando...' : 'Buscar grupos'}
              </Button>
            </div>
            {erroGrupos && <p role="alert" className="text-sm text-destructive">{erroGrupos}</p>}
            <div className="space-y-2">
              {(turmas.data ?? []).map(t => (
                <div key={t.id} className="grid gap-2 sm:grid-cols-2 items-center">
                  <span className="text-sm">{t.nome}</span>
                  <Select value={t.grupo_whatsapp_jid ?? undefined} onValueChange={(v) => void vincularGrupo(t.id, v)} disabled={grupos.length === 0}>
                    <SelectTrigger><SelectValue placeholder={grupos.length ? 'Escolha o grupo' : 'Busque os grupos primeiro'} /></SelectTrigger>
                    <SelectContent>
                      {grupos.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </>}

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Fechar</Button>
          <Button disabled={salvando} onClick={() => void salvarConfig(config.data?.ativo ?? false)}>Salvar modelo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
