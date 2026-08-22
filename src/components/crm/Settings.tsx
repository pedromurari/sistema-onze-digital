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
import { Webhook, BookOpen, Globe, Plus, Trash2, Send, Smartphone, RefreshCw, Loader2, CheckCircle2, XCircle, QrCode, FileText, Copy, ExternalLink, ChevronRight, MessageSquare, Zap, Wallet } from 'lucide-react';
import { EvolutionTaskPanel } from './EvolutionTaskPanel';
import { ConnStateBadge } from './ConnStateBadge';
import { fetchConnectionState, configurarWebhookRespostas, fetchQrCode, type EvolutionInstance, type ConnState } from '@/lib/evolution-status';
import { COLUNAS_EVOLUTION_VISIVEIS } from '@/lib/evolution';

function useEvolutionInstances() {
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    // Nao usar select('*'): a leitura de `api_key` foi revogada no banco e o '*' quebraria.
    const { data, error } = await supabase
      .from('evolution_config')
      .select(COLUNAS_EVOLUTION_VISIVEIS)
      .order('instance_name');
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
    const inst = instances.find(i => i.id === id);
    if (!inst) return;
    await supabase.from('evolution_config').update({ ativo: !inst.ativo }).eq('id', id);
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ativo: !i.ativo } : i));
  };

  const remove = async (id: string) => {
    await supabase.from('evolution_config').delete().eq('id', id);
    setInstances(prev => prev.filter(i => i.id !== id));
  };

  return { instances, loading, load, save, toggle, remove };
}

interface CanalCobranca {
  id: string;
  nome: string;
  ativo: boolean;
}

function useCanaisCobranca() {
  const [canais, setCanais] = useState<CanalCobranca[]>([]);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('canais_cobranca').select('id, nome, ativo').order('nome');
    if (!error && data) setCanais(data as CanalCobranca[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (nome: string) => {
    const { error } = await supabase.from('canais_cobranca').insert({ nome });
    if (error) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); return; }
    await load();
  };

  const toggle = async (id: string) => {
    const canal = canais.find(c => c.id === id);
    if (!canal) return;
    await supabase.from('canais_cobranca').update({ ativo: !canal.ativo }).eq('id', id);
    setCanais(prev => prev.map(c => c.id === id ? { ...c, ativo: !c.ativo } : c));
  };

  const remove = async (id: string) => {
    await supabase.from('canais_cobranca').delete().eq('id', id);
    setCanais(prev => prev.filter(c => c.id !== id));
  };

  return { canais, add, toggle, remove };
}

// O QR vem pelo proxy: a chave da Evolution nao sai mais do servidor.
// (Esta funcao era uma copia local da que vive em lib/evolution-status.)

const EVO_RESPOSTA_URL = `https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/evo-resposta`;

type ConfigState = 'idle' | 'loading' | 'ok' | 'error';

function WebhookRespostasCard({ instances }: { instances: EvolutionInstance[] }) {
  const [states, setStates] = useState<Record<string, ConfigState>>({});
  const { toast } = useToast();

  async function configurarInstancia(inst: EvolutionInstance) {
    setStates(prev => ({ ...prev, [inst.id]: 'loading' }));

    // Passa pelo proxy: a chave da Evolution nao sai do servidor. A tentativa v2 -> v1
    // vive em `configurarWebhookRespostas`, uma copia so.
    const ok = await configurarWebhookRespostas(inst);

    const next: ConfigState = ok ? 'ok' : 'error';
    setStates(prev => ({ ...prev, [inst.id]: next }));

    if (ok) {
      toast({ title: `Webhook configurado — ${inst.instance_name}`, description: 'Respostas de leads da planilha serão capturadas automaticamente.' });
    } else {
      toast({ variant: 'destructive', title: 'Erro ao configurar', description: `Não foi possível registrar o webhook em ${inst.instance_name}. Verifique a URL e a API key.` });
    }
  }

  async function configurarTodas() {
    for (const inst of instances.filter(i => i.ativo)) {
      await configurarInstancia(inst);
    }
  }

  return (
    <Card className="p-6 bg-card border-border space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Webhook de Respostas (Evolution API)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Captura mensagens recebidas e registra apenas as de leads que estão na planilha do lançamento.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={configurarTodas} className="gap-1.5 shrink-0">
          <Zap className="h-3.5 w-3.5" />
          Configurar todas
        </Button>
      </div>

      {/* URL do webhook */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">URL do Webhook</p>
        <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2 font-mono text-xs break-all">
          <span className="flex-1 text-foreground">{EVO_RESPOSTA_URL}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(EVO_RESPOSTA_URL); toast({ title: 'URL copiada!' }); }}
            className="p-1 hover:bg-muted rounded flex-none"
            title="Copiar URL"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Eventos registrados: <code className="bg-muted px-1 py-0.5 rounded">MESSAGES_UPSERT</code>, <code className="bg-muted px-1 py-0.5 rounded">MESSAGES_UPDATE</code>, <code className="bg-muted px-1 py-0.5 rounded">CONNECTION_UPDATE</code>
        </p>
      </div>

      {/* Por instância */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configurar por instância</p>
        {instances.map(inst => {
          const st = states[inst.id] ?? 'idle';
          return (
            <div key={inst.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              <Smartphone className="h-4 w-4 text-muted-foreground flex-none" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{inst.instance_name}</p>
                {!inst.ativo && <p className="text-xs text-amber-600">instância inativa</p>}
              </div>
              {st === 'ok' && (
                <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Configurado
                </span>
              )}
              {st === 'error' && (
                <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                  <XCircle className="h-3.5 w-3.5" /> Erro
                </span>
              )}
              <Button
                size="sm"
                variant={st === 'ok' ? 'outline' : 'default'}
                disabled={st === 'loading' || !inst.ativo}
                onClick={() => configurarInstancia(inst)}
                className="gap-1.5 shrink-0"
              >
                {st === 'loading'
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Configurando…</>
                  : st === 'ok'
                    ? <><RefreshCw className="h-3.5 w-3.5" />Reconfigurar</>
                    : <><Zap className="h-3.5 w-3.5" />Configurar</>}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Como funciona */}
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-1">
        <p className="text-xs font-semibold text-sky-800">Como funciona</p>
        <ul className="text-xs text-sky-700 space-y-0.5 list-disc list-inside">
          <li>A Evolution API envia cada mensagem recebida para este webhook</li>
          <li>Mensagens enviadas por você e mensagens de grupo são <strong>ignoradas</strong></li>
          <li>Só processa se o telefone estiver em algum lançamento da planilha</li>
          <li>A resposta fica salva em <code className="bg-sky-100 px-0.5 rounded">lead_respostas</code> e aparece no card do lead</li>
          <li>ACK de entrega/leitura e mudanças de conexão alimentam a aba Aquecimento de Chips → Métricas</li>
        </ul>
      </div>
    </Card>
  );
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

      {/* Webhook de Respostas */}
      {instances.length > 0 && (
        <WebhookRespostasCard instances={instances} />
      )}

      {/* Prioridade por serviço */}
      {instances.length > 0 && (
        <Card className="p-6 bg-card border-border">
          <h2 className="text-lg font-semibold text-foreground mb-1">Prioridade por Serviço</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Selecione qual número envia cada tipo de mensagem e adicione backups opcionais.
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(['cobranca', 'funil', 'disparo', 'boas_vindas'] as const).map(task => {
              const labels: Record<string, string> = { cobranca: 'Cobrança', funil: 'Funil', disparo: 'Disparo', boas_vindas: 'Boas-vindas' };
              const icons: Record<string, string> = { cobranca: '💳', funil: '🎯', disparo: '📢', boas_vindas: '👋' };
              return (
                <div key={task} className="rounded-lg border p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    {icons[task]} {labels[task]}
                  </p>
                  <EvolutionTaskPanel task={task} label={labels[task]} />
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
  const { canais: canaisCobranca, add: addCanalCobranca, toggle: toggleCanalCobranca, remove: removeCanalCobranca } = useCanaisCobranca();
  const { toast } = useToast();
  const [webhookOut, setWebhookOut] = useState(config.webhookOut || '');
  const [webhookIn, setWebhookIn] = useState(config.webhookIn || '');
  const [newCurso, setNewCurso] = useState('');
  const [newFonte, setNewFonte] = useState('');
  const [newCanalCobranca, setNewCanalCobranca] = useState('');

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

  const handleAddCanalCobranca = async () => {
    if (!newCanalCobranca.trim()) return;
    await addCanalCobranca(newCanalCobranca.trim());
    setNewCanalCobranca('');
    toast({ title: 'Canal adicionado' });
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
          <TabsTrigger value="canais_cobranca">
            <Wallet className="h-4 w-4 mr-2" />
            Canais de Cobrança
          </TabsTrigger>
          <TabsTrigger value="contratos">
            <FileText className="h-4 w-4 mr-2" />
            Contratos
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
                    value="https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/webhook-leads"
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText('https://usqiyekfmwwnvkmkdlej.supabase.co/functions/v1/webhook-leads');
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

        <TabsContent value="canais_cobranca" className="space-y-4">
          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold text-foreground mb-1">Canais de Cobrança</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Opções que aparecem ao dar baixa num pagamento, para registrar de onde veio o dinheiro
              (ex: Asaas, Vega, PIX manual, link de parceiro). Assim dá pra calcular a taxa exata de cada transação.
            </p>
            <div className="flex gap-2 mb-4">
              <Input
                value={newCanalCobranca}
                onChange={(e) => setNewCanalCobranca(e.target.value)}
                placeholder="Nome do novo canal"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCanalCobranca()}
              />
              <Button onClick={handleAddCanalCobranca} className="gradient-primary hover:opacity-90">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {canaisCobranca.map((canal) => (
                <div
                  key={canal.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span className={canal.ativo ? 'text-foreground' : 'text-muted-foreground line-through'}>{canal.nome}</span>
                    {!canal.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleCanalCobranca(canal.id)}>
                      {canal.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCanalCobranca(canal.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {canaisCobranca.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum canal cadastrado ainda.</p>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ── Contratos / Autentique ─────────────────────────────────────── */}
        <TabsContent value="contratos" className="space-y-4">

          {/* Fluxo visual */}
          <Card className="p-6 bg-card border-border">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Fluxo de Contrato
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Como funciona o processo integrado de contrato — do pagamento à assinatura.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm">
              {[
                { icon: '💰', label: 'Matrícula confirmada', desc: 'Lead movido para "Matrícula" no Kanban' },
                { icon: '📩', label: 'Link enviado por WPP', desc: 'URL única gerada automaticamente' },
                { icon: '📋', label: 'Aluno preenche dados', desc: 'CPF, nascimento, endereço' },
                { icon: '📝', label: 'Contrato gerado', desc: 'Autentique cria o documento' },
                { icon: '✅', label: 'Aluno assina', desc: 'Webhook atualiza o sistema' },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="bg-muted/60 rounded-lg p-3 text-center w-32 flex-shrink-0">
                    <div className="text-2xl mb-1">{step.icon}</div>
                    <p className="text-[11px] font-semibold leading-tight">{step.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{step.desc}</p>
                  </div>
                  {i < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </div>
              ))}
            </div>
          </Card>

          {/* Config Autentique */}
          <Card className="p-6 bg-card border-border space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🔐 Configuração da Autentique
            </h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
                <span className="text-2xl flex-shrink-0">1️⃣</span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">Obter token da API</p>
                  <p className="text-xs text-amber-700">
                    Acesse <strong>autentique.com.br → Configurações → API</strong> e copie seu token de acesso.
                  </p>
                  <a href="https://app.autentique.com.br/dashboard/configuracoes" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-700 underline font-medium">
                    <ExternalLink className="h-3 w-3" /> Abrir Autentique
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
                <span className="text-2xl flex-shrink-0">2️⃣</span>
                <div className="space-y-2 w-full">
                  <p className="text-sm font-semibold text-blue-900">Adicionar secret no Supabase</p>
                  <p className="text-xs text-blue-700">
                    Acesse <strong>Supabase → Edge Functions → Secrets</strong> e adicione:
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-blue-200 rounded px-3 py-2 font-mono text-xs">
                    <span className="flex-1 text-blue-900">AUTENTIQUE_TOKEN = seu_token_aqui</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText('AUTENTIQUE_TOKEN'); }}
                      className="p-1 hover:bg-blue-100 rounded"
                      title="Copiar nome da variável"
                    >
                      <Copy className="h-3 w-3 text-blue-600" />
                    </button>
                  </div>
                  <a href="https://supabase.com/dashboard/project/usqiyekfmwwnvkmkdlej/functions" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-700 underline font-medium">
                    <ExternalLink className="h-3 w-3" /> Abrir Supabase Functions
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border border-violet-200 bg-violet-50">
                <span className="text-2xl flex-shrink-0">3️⃣</span>
                <div className="space-y-2 w-full">
                  <p className="text-sm font-semibold text-violet-900">Configurar Webhook na Autentique</p>
                  <p className="text-xs text-violet-700">
                    Em <strong>Autentique → Configurações → Webhooks</strong>, adicione a URL abaixo.
                    Ela será chamada automaticamente quando o aluno assinar.
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-violet-200 rounded px-3 py-2 font-mono text-xs break-all">
                    <span className="flex-1 text-violet-900">
                      {import.meta.env.VITE_SUPABASE_URL}/functions/v1/autentique-webhook
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/autentique-webhook`);
                      }}
                      className="p-1 hover:bg-violet-100 rounded flex-shrink-0"
                      title="Copiar URL"
                    >
                      <Copy className="h-3 w-3 text-violet-600" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
                <span className="text-2xl flex-shrink-0">4️⃣</span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-900">Enviar link para o aluno</p>
                  <p className="text-xs text-emerald-700">
                    No <strong>Financeiro → painel do aluno</strong>, clique em "Enviar por WPP" na seção
                    "Formulário de Contrato". O link tem o formato:
                  </p>
                  <div className="font-mono text-xs bg-white border border-emerald-200 rounded px-3 py-2 text-emerald-800 break-all">
                    {window.location.origin}/assinar/[token-único-do-aluno]
                  </div>
                </div>
              </div>
            </div>
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
