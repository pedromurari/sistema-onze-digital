import { useState, useEffect, useCallback } from 'react';
import { useLeads } from '@/contexts/LeadsContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { validateWebhookUrl, WebhookUrlValidationError } from '@/lib/webhook';
import { supabase } from '@/integrations/supabase/client';
import { Webhook, BookOpen, Globe, Plus, Trash2, Send, Smartphone, RefreshCw, Loader2, CheckCircle2, XCircle, QrCode } from 'lucide-react';

interface EvolutionInstance {
  id: string;
  instance_name: string;
  api_url: string;
  api_key: string;
  ativo: boolean;
}

type ConnState = 'open' | 'close' | 'connecting' | 'loading' | 'unknown';

function useEvolutionInstances() {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('evolution_config').select('*').order('instance_name');
    if (!error && data) setInstances(data as EvolutionInstance[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (inst: Omit<EvolutionInstance, 'id'>) => {
    const { error } = await supabase.from('evolution_config').insert({ id: crypto.randomUUID(), ...inst });
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return false; }
    await load();
    return true;
  };

  const toggle = async (id: string) => {
    // Desativa todas, ativa só a selecionada
    await supabase.from('evolution_config').update({ ativo: false }).neq('id', 'none');
    await supabase.from('evolution_config').update({ ativo: true }).eq('id', id);
    setInstances(prev => prev.map(i => ({ ...i, ativo: i.id === id })));
  };

  const remove = async (id: string) => {
    await supabase.from('evolution_config').delete().eq('id', id);
    setInstances(prev => prev.filter(i => i.id !== id));
  };

  return { instances, loading, load, save, toggle, remove };
}

async function fetchConnectionState(inst: EvolutionInstance): Promise<ConnState> {
  try {
    const res = await fetch(`${inst.api_url}/instance/connectionState/${inst.instance_name}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 'unknown';
    const json = await res.json() as Record<string, unknown>;
    const state = String(json?.instance?.state ?? json?.state ?? json?.connectionStatus ?? 'unknown').toLowerCase();
    if (state.includes('open')) return 'open';
    if (state.includes('connect')) return 'connecting';
    if (state.includes('close') || state.includes('logout')) return 'close';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

async function fetchQrCode(inst: EvolutionInstance): Promise<string | null> {
  try {
    // Try connect endpoint first (returns QR)
    const res = await fetch(`${inst.api_url}/instance/connect/${inst.instance_name}`, {
      headers: { apikey: inst.api_key },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    return String(json?.base64 ?? json?.qrcode?.base64 ?? json?.code ?? '') || null;
  } catch {
    return null;
  }
}

function ConnStateBadge({ state }: { state: ConnState }) {
  if (state === 'loading') return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verificando</Badge>;
  if (state === 'open') return <Badge className="gap-1 bg-green-100 text-green-800 border-green-200"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>;
  if (state === 'connecting') return <Badge variant="outline" className="gap-1 text-yellow-700 border-yellow-300 bg-yellow-50"><Loader2 className="h-3 w-3 animate-spin" />Conectando</Badge>;
  if (state === 'close') return <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><XCircle className="h-3 w-3" />Desconectado</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Desconhecido</Badge>;
}

function EvolutionTab() {
  const { instances, loading, load, save, toggle, remove } = useEvolutionInstances();
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [qrDialog, setQrDialog] = useState<{ open: boolean; inst?: EvolutionInstance; qr?: string; checking: boolean }>({ open: false, checking: false });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ instance_name: '', api_url: '', api_key: '' });
  const { toast } = useToast();

  const checkAll = useCallback(async (list: EvolutionInstance[]) => {
    setStates(prev => Object.fromEntries(list.map(i => [i.id, prev[i.id] ?? 'loading'])));
    const results = await Promise.all(list.map(async i => ({ id: i.id, state: await fetchConnectionState(i) })));
    setStates(Object.fromEntries(results.map(r => [r.id, r.state])));
  }, []);

  useEffect(() => {
    if (instances.length) checkAll(instances);
  }, [instances, checkAll]);

  const handleReconnect = async (inst: EvolutionInstance) => {
    setQrDialog({ open: true, inst, checking: true });
    const qr = await fetchQrCode(inst);
    setQrDialog({ open: true, inst, qr: qr ?? undefined, checking: false });
    if (!qr) toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível obter o QR code. Verifique a URL e a API key.' });
  };

  const handleAdd = async () => {
    if (!form.instance_name || !form.api_url || !form.api_key) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos' }); return;
    }
    const ok = await save({ ...form, ativo: true });
    if (ok) { setForm({ instance_name: '', api_url: '', api_key: '' }); setAdding(false); toast({ title: 'Instância adicionada' }); }
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" />Carregando instâncias...</div>;

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Instâncias Evolution API</h2>
            <p className="text-sm text-muted-foreground mt-1">Gerencie as conexões WhatsApp usadas nos lançamentos.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { load(); }} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />Atualizar
            </Button>
            <Button size="sm" onClick={() => setAdding(true)} className="gap-1 bg-primary hover:bg-primary/90 text-white">
              <Plus className="h-3.5 w-3.5" />Nova
            </Button>
          </div>
        </div>

        {instances.length === 0 && !adding && (
          <div className="text-center py-8 text-muted-foreground">
            <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma instância configurada.</p>
          </div>
        )}

        <div className="space-y-3">
          {instances.map(inst => (
            <div key={inst.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{inst.instance_name}</p>
                <p className="text-xs text-muted-foreground truncate">{inst.api_url}</p>
              </div>
              <ConnStateBadge state={states[inst.id] ?? 'loading'} />
              <Switch checked={inst.ativo} onCheckedChange={() => toggle(inst.id)} title={inst.ativo ? 'Instância ativa' : 'Clique para usar esta'} />
              <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => handleReconnect(inst)}>
                <QrCode className="h-3.5 w-3.5" />Reconectar
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive shrink-0" onClick={() => remove(inst.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {adding && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <p className="text-sm font-medium text-foreground">Nova Instância</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome da instância</Label>
                  <Input placeholder="pm" value={form.instance_name} onChange={e => setForm(f => ({ ...f, instance_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">URL da API</Label>
                  <Input placeholder="https://evolution.exemplo.com" value={form.api_url} onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">API Key</Label>
                  <Input placeholder="sua-api-key" type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} className="bg-primary hover:bg-primary/90 text-white">Salvar</Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={qrDialog.open} onOpenChange={open => setQrDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reconectar {qrDialog.inst?.instance_name}</DialogTitle>
          </DialogHeader>
          {qrDialog.checking ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando QR code...</p>
            </div>
          ) : qrDialog.qr ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground text-center">Escaneie com o WhatsApp do número que deseja conectar.</p>
              <img
                src={qrDialog.qr.startsWith('data:') ? qrDialog.qr : `data:image/png;base64,${qrDialog.qr}`}
                alt="QR Code WhatsApp"
                className="w-56 h-56 rounded-lg border border-border"
              />
              <Button variant="outline" size="sm" className="gap-1" onClick={() => qrDialog.inst && handleReconnect(qrDialog.inst)}>
                <RefreshCw className="h-3.5 w-3.5" />Gerar novo QR
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <XCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Não foi possível obter o QR code.<br />Verifique se a instância existe na Evolution API e se a API key está correta.</p>
              <Button variant="outline" size="sm" onClick={() => qrDialog.inst && handleReconnect(qrDialog.inst)}>Tentar novamente</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Settings() {
  const { cursos, fontes, config, addCurso, deleteCurso, addFonte, deleteFonte, updateConfig } = useLeads();
  const { toast } = useToast();
  const [webhookOut, setWebhookOut] = useState(config.webhookOut || '');
  const [webhookIn, setWebhookIn] = useState(config.webhookIn || '');
  const [newCurso, setNewCurso] = useState('');
  const [newFonte, setNewFonte] = useState('');

  const saveWebhooks = async () => {
    try {
      // Validate on the client too so the user gets immediate feedback.
      validateWebhookUrl(webhookOut);
      validateWebhookUrl(webhookIn);

      await updateConfig({ webhookOut, webhookIn });
      toast({
        title: 'Configurações salvas',
        description: 'As URLs de webhook foram atualizadas.',
      });
    } catch (err) {
      const message =
        err instanceof WebhookUrlValidationError
          ? err.message
          : 'Não foi possível salvar as configurações.';
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: message,
      });
    }
  };

  const testWebhook = async () => {
    if (!webhookOut) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Configure a URL do webhook primeiro.',
      });
      return;
    }

    try {
      const url = validateWebhookUrl(webhookOut);

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'test',
          message: 'Teste de webhook do CRM Onze Digital',
          timestamp: new Date().toISOString(),
        }),
      });

      toast({
        title: 'Teste enviado',
        description: 'Verifique seu sistema de automação para confirmar o recebimento.',
      });
    } catch (err) {
      const message =
        err instanceof WebhookUrlValidationError
          ? err.message
          : 'Não foi possível enviar o teste.';
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: message,
      });
    }
  };

  const handleAddCurso = () => {
    if (!newCurso.trim()) return;
    addCurso(newCurso.trim());
    setNewCurso('');
    toast({ title: 'Curso adicionado' });
  };

  const handleAddFonte = () => {
    if (!newFonte.trim()) return;
    addFonte(newFonte.trim());
    setNewFonte('');
    toast({ title: 'Fonte adicionada' });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in pb-20 lg:pb-6">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <Smartphone className="h-4 w-4 mr-2" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="cursos">
            <BookOpen className="h-4 w-4 mr-2" />
            Cursos
          </TabsTrigger>
          <TabsTrigger value="fontes">
            <Globe className="h-4 w-4 mr-2" />
            Fontes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-4">
          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Webhook de Saída (Enviar dados)</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Configure uma URL para receber dados quando leads forem criados ou atualizados.
              Compatível com n8n, Zapier, Make e outros.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <Input
                  value={webhookOut}
                  onChange={(e) => setWebhookOut(e.target.value)}
                  placeholder="https://n8n.seu-servidor.com/webhook/..."
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={saveWebhooks} className="gradient-primary hover:opacity-90">
                  Salvar
                </Button>
                <Button variant="outline" onClick={testWebhook}>
                  <Send className="h-4 w-4 mr-2" />
                  Testar
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Webhook de Entrada (Receber leads)</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Use esta URL no n8n, Zapier ou Make para enviar leads automaticamente para o CRM.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook (copie para sua integração)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value="https://qdpitjwpvmqsgshsdiab.supabase.co/functions/v1/webhook-leads"
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText('https://qdpitjwpvmqsgshsdiab.supabase.co/functions/v1/webhook-leads');
                      toast({ title: 'URL copiada!' });
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm font-medium text-foreground">Campos aceitos (JSON POST):</p>
                <code className="text-xs text-muted-foreground block">
                  {`{ "nome": "...", "telefone": "...", "email": "(opcional)", "curso_interesse": "...", "fonte": "...", "valor": 0 }`}
                </code>
                <p className="text-xs text-muted-foreground">* obrigatórios: nome e telefone</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <EvolutionTab />
        </TabsContent>

        <TabsContent value="cursos" className="space-y-4">
          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Cursos Disponíveis</h2>
            <div className="flex gap-2 mb-4">
              <Input
                value={newCurso}
                onChange={(e) => setNewCurso(e.target.value)}
                placeholder="Nome do novo curso"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCurso()}
              />
              <Button onClick={handleAddCurso} className="gradient-primary hover:opacity-90">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {cursos.map((curso) => (
                <div
                  key={curso.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted"
                >
                  <span className="text-foreground">{curso.nome}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteCurso(curso.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fontes" className="space-y-4">
          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">Fontes de Leads</h2>
            <div className="flex gap-2 mb-4">
              <Input
                value={newFonte}
                onChange={(e) => setNewFonte(e.target.value)}
                placeholder="Nome da nova fonte"
                onKeyDown={(e) => e.key === 'Enter' && handleAddFonte()}
              />
              <Button onClick={handleAddFonte} className="gradient-primary hover:opacity-90">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {fontes.map((fonte) => (
                <div
                  key={fonte.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted"
                >
                  <span className="text-foreground">{fonte.nome}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteFonte(fonte.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
