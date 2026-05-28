import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Rocket, Target, MessageCircle, CalendarDays, HandHeart, ClipboardList,
  ChevronLeft, ChevronRight, Check, Loader2, ExternalLink,
} from 'lucide-react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type TipoLancamento = 'lancamento_3_aulas' | 'npa_1_aula';

interface WizardData {
  nome: string;
  tipo: TipoLancamento;
  responsavel: string;
  metaLeads: string;
  metaMatriculas: string;
  dataAula1: string;
  dataAula2: string;
  dataAula3: string;
  horario: string;
  turmaNumero: string;
  gasUrl: string;
  whatsappLink: string;
  repoCaptura: string;
  repoObrigado: string;
}

interface ResultData {
  repoCaptura: string;
  repoObrigado: string;
  captura: string;
  obrigado: string;
  log: string[];
}

const ETAPAS = [
  { label: 'Básico',       icon: Rocket },
  { label: 'Turma',        icon: Target },
  { label: 'Grupos WPP',   icon: MessageCircle },
  { label: 'Aulas',        icon: CalendarDays },
  { label: 'Boas-Vindas',  icon: HandHeart },
  { label: 'Revisão',      icon: ClipboardList },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function extrairNumero(nome: string): string {
  const m = nome.match(/#?(\d+)/);
  return m ? m[1] : '';
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function NovoLancamentoWizard({ open, onClose, onCreated }: Props) {
  const [etapa, setEtapa] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);

  const [data, setData] = useState<WizardData>({
    nome: '',
    tipo: 'lancamento_3_aulas',
    responsavel: '',
    metaLeads: '',
    metaMatriculas: '',
    dataAula1: '',
    dataAula2: '',
    dataAula3: '',
    horario: '20:00',
    turmaNumero: '',
    gasUrl: '',
    whatsappLink: '',
    repoCaptura: '',
    repoObrigado: '',
  });

  function set<K extends keyof WizardData>(key: K, val: WizardData[K]) {
    setData(prev => {
      const next = { ...prev, [key]: val };
      // auto-preenche número e repos ao digitar o nome
      if (key === 'nome') {
        const n = extrairNumero(val as string);
        if (n) {
          next.turmaNumero = n;
          next.repoCaptura = `gratuito-${n}`;
          next.repoObrigado = `obrigado-${n}`;
        }
      }
      if (key === 'turmaNumero') {
        const n = val as string;
        next.repoCaptura = n ? `gratuito-${n}` : '';
        next.repoObrigado = n ? `obrigado-${n}` : '';
      }
      return next;
    });
  }

  function reset() {
    setEtapa(0);
    setResult(null);
    setData({
      nome: '', tipo: 'lancamento_3_aulas', responsavel: '',
      metaLeads: '', metaMatriculas: '',
      dataAula1: '', dataAula2: '', dataAula3: '', horario: '20:00',
      turmaNumero: '', gasUrl: '', whatsappLink: '',
      repoCaptura: '', repoObrigado: '',
    });
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Validação por etapa ────────────────────────────────────────────────────

  function etapaValida(): boolean {
    switch (etapa) {
      case 0: return !!data.nome.trim() && !!data.dataAula1;
      case 1: return !!data.turmaNumero && !!data.gasUrl.trim();
      case 2: return !!data.whatsappLink.trim();
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return true;
    }
  }

  // ── Criação final ──────────────────────────────────────────────────────────

  async function criar() {
    if (!data.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setLoading(true);

    try {
      // 1. Insere em lancamentos
      const { data: row, error } = await supabase
        .from('lancamentos')
        .insert({
          nome: data.nome.trim(),
          status: 'planejamento',
          ativo: false,
          meta_leads: data.metaLeads ? Number(data.metaLeads) : 0,
          meta_matriculas: data.metaMatriculas ? Number(data.metaMatriculas) : 0,
          tipo: data.tipo,
          turma_numero: data.turmaNumero ? Number(data.turmaNumero) : null,
          gas_url: data.gasUrl || null,
          whatsapp_group_link: data.whatsappLink || null,
          github_repo_captura: data.repoCaptura || null,
          github_repo_obrigado: data.repoObrigado || null,
          data_aula_1: data.dataAula1 || null,
          data_aula_2: data.dataAula2 || null,
          data_aula_3: data.dataAula3 || null,
          horario_live: data.horario || '20:00',
          responsavel_nome: data.responsavel || null,
          pages_status: 'criando',
          created_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (error) { toast.error(`Erro ao criar lançamento: ${error.message}`); setLoading(false); return; }

      const lancamentoId = row.id as string;

      // 2. RPC: cria tabela sheet_leads_{NUM} + kanban
      if (data.turmaNumero) {
        try {
          await (supabase as any).rpc('setup_lancamento_pages', {
            p_lancamento_id: lancamentoId,
            p_turma_numero: Number(data.turmaNumero),
          });
        } catch (e: any) {
          toast.warning('Kanban/tabela: ' + e.message);
        }
      }

      // 3. Chama Vercel function para GitHub + Vercel deploy
      if (data.turmaNumero && data.repoCaptura && data.repoObrigado) {
        try {
          const resp = await fetch('/api/setup-lancamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lancamentoId,
              turmaNumero: Number(data.turmaNumero),
              nome: data.nome,
              datas: {
                aula1: data.dataAula1,
                aula2: data.dataAula2 || data.dataAula1,
                aula3: data.dataAula3 || data.dataAula2 || data.dataAula1,
                horario: data.horario,
              },
              gasUrl: data.gasUrl,
              whatsappLink: data.whatsappLink,
              repoCaptura: data.repoCaptura,
              repoObrigado: data.repoObrigado,
            }),
          });

          const json = await resp.json();

          if (json.success) {
            await supabase.from('lancamentos').update({ pages_status: 'concluido' } as any)
              .eq('id', lancamentoId);
            setResult(json.urls ? { ...json.urls, log: json.log } : null);
            toast.success('Páginas criadas e deploy iniciado! 🚀');
          } else {
            toast.warning(`Setup parcial: ${json.error}`);
            setResult({ repoCaptura: '', repoObrigado: '', captura: '', obrigado: '', log: json.log || [] });
          }
        } catch (e: any) {
          toast.warning('GitHub/Vercel: ' + e.message);
        }
      }

      toast.success(`Lançamento "${data.nome}" criado!`);
      onCreated(lancamentoId);
      setEtapa(6); // tela de resultado
    } catch (e: any) {
      toast.error('Erro inesperado: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Rocket className="h-5 w-5 text-primary" />
            Novo Lançamento / NPA
          </DialogTitle>
        </DialogHeader>

        {/* Abas de etapas */}
        {etapa < 6 && (
          <div className="flex items-center gap-1 px-6 pt-4 pb-2 overflow-x-auto">
            {ETAPAS.map((e, i) => {
              const Icon = e.icon;
              const ativa = i === etapa;
              const concluida = i < etapa;
              return (
                <button
                  key={i}
                  onClick={() => i < etapa && setEtapa(i)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all',
                    ativa && 'bg-primary text-white',
                    concluida && 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20',
                    !ativa && !concluida && 'text-muted-foreground bg-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {e.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="px-6 pb-2 min-h-[280px]">

          {/* Etapa 0 – Básico */}
          {etapa === 0 && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome *</Label>
                <Input
                  placeholder="Ex: Lançamento #36"
                  value={data.nome}
                  onChange={e => set('nome', e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <div className="flex gap-2 mt-1">
                    {(['lancamento_3_aulas', 'npa_1_aula'] as TipoLancamento[]).map(t => (
                      <button
                        key={t}
                        onClick={() => set('tipo', t)}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-all',
                          data.tipo === t
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50',
                        )}
                      >
                        {t === 'lancamento_3_aulas' ? '🚀 Lançamento (3 aulas)' : '🎯 NPA (1 aula)'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Input
                    placeholder="Nome"
                    value={data.responsavel}
                    onChange={e => set('responsavel', e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Meta de leads</Label>
                  <Input type="number" placeholder="Ex: 500" value={data.metaLeads}
                    onChange={e => set('metaLeads', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Meta de matrículas</Label>
                  <Input type="number" placeholder="Ex: 30" value={data.metaMatriculas}
                    onChange={e => set('metaMatriculas', e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    Datas das {data.tipo === 'lancamento_3_aulas' ? '3 lives' : '1 live'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Horário padrão</span>
                    <Input type="time" value={data.horario}
                      onChange={e => set('horario', e.target.value)}
                      className="w-28 text-sm h-8" />
                  </div>
                </div>
                <div className={cn('grid gap-3', data.tipo === 'lancamento_3_aulas' ? 'grid-cols-3' : 'grid-cols-1')}>
                  {(['dataAula1', 'dataAula2', 'dataAula3'] as const)
                    .slice(0, data.tipo === 'lancamento_3_aulas' ? 3 : 1)
                    .map((k, i) => (
                      <div key={k}>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          Aula {i + 1}
                        </span>
                        <Input type="date" value={data[k]}
                          onChange={e => set(k, e.target.value)} className="mt-1" />
                      </div>
                    ))}
                </div>
                <p className="text-xs text-amber-600 mt-1.5">
                  💡 Essas datas são marcadas automaticamente no calendário ao salvar.
                </p>
              </div>
            </div>
          )}

          {/* Etapa 1 – Turma */}
          {etapa === 1 && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Número da turma *</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 36"
                    value={data.turmaNumero}
                    onChange={e => set('turmaNumero', e.target.value)}
                    className="mt-1"
                    autoFocus
                  />
                </div>
                <div />
              </div>

              <div>
                <Label>URL do Google Apps Script *</Label>
                <Input
                  placeholder="https://script.google.com/macros/s/..."
                  value={data.gasUrl}
                  onChange={e => set('gasUrl', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obtida em: Implantar → Implantar como aplicativo da Web
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Repo GitHub — Captura</Label>
                  <Input value={data.repoCaptura}
                    onChange={e => setData(p => ({ ...p, repoCaptura: e.target.value }))}
                    className="mt-1" placeholder="gratuito-36" />
                </div>
                <div>
                  <Label>Repo GitHub — Obrigado</Label>
                  <Input value={data.repoObrigado}
                    onChange={e => setData(p => ({ ...p, repoObrigado: e.target.value }))}
                    className="mt-1" placeholder="obrigado-36" />
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p>✅ Os repositórios serão criados automaticamente no GitHub.</p>
                <p>✅ Deploy automático na Vercel com domínios configurados.</p>
                <p>✅ Variáveis de ambiente configuradas automaticamente.</p>
              </div>
            </div>
          )}

          {/* Etapa 2 – Grupos WPP */}
          {etapa === 2 && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Link do Grupo WhatsApp *</Label>
                <Input
                  placeholder="https://chat.whatsapp.com/..."
                  value={data.whatsappLink}
                  onChange={e => set('whatsappLink', e.target.value)}
                  className="mt-1"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Este link aparece na página de obrigado após o lead se cadastrar.
                </p>
              </div>

              <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                <p className="text-sm font-semibold text-primary mb-1">📱 Onde este link é usado</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Página de obrigado — botão "Entrar no Grupo"</li>
                  <li>• Sequência de e-mails / WhatsApp</li>
                </ul>
              </div>
            </div>
          )}

          {/* Etapa 3 – Aulas */}
          {etapa === 3 && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Confirme as datas das aulas definidas na etapa Básico.
              </p>
              {(['dataAula1', 'dataAula2', 'dataAula3'] as const)
                .slice(0, data.tipo === 'lancamento_3_aulas' ? 3 : 1)
                .map((k, i) => (
                  <div key={k} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Aula {i + 1}</p>
                      <p className="font-semibold">
                        {data[k]
                          ? new Date(data[k] + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
                          : '—'}
                        {data[k] && <span className="text-muted-foreground font-normal ml-2">às {data.horario}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              {!data.dataAula1 && (
                <p className="text-amber-600 text-sm">⚠️ Nenhuma data definida. Volte para a etapa Básico.</p>
              )}
            </div>
          )}

          {/* Etapa 4 – Boas-Vindas */}
          {etapa === 4 && (
            <div className="space-y-4 pt-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="font-semibold text-emerald-800 mb-1">🙏 Página de Boas-Vindas</p>
                <p className="text-sm text-emerald-700">
                  A página de obrigado será configurada automaticamente com:
                </p>
                <ul className="text-sm text-emerald-700 mt-2 space-y-1">
                  <li>✓ Link do grupo: <span className="font-mono text-xs break-all">{data.whatsappLink || '—'}</span></li>
                  <li>✓ Datas das aulas: {data.dataAula1 ? `${data.dataAula1}${data.dataAula2 ? ', ' + data.dataAula2 : ''}${data.dataAula3 ? ', ' + data.dataAula3 : ''}` : '—'}</li>
                  <li>✓ Pixel Meta: 1472969447740954</li>
                </ul>
              </div>
            </div>
          )}

          {/* Etapa 5 – Revisão */}
          {etapa === 5 && (
            <div className="space-y-3 pt-2">
              <p className="text-sm font-semibold text-foreground">Revise antes de criar:</p>
              {[
                ['Nome', data.nome],
                ['Tipo', data.tipo === 'lancamento_3_aulas' ? 'Lançamento (3 aulas)' : 'NPA (1 aula)'],
                ['Turma #', data.turmaNumero || '—'],
                ['Responsável', data.responsavel || '—'],
                ['Meta leads', data.metaLeads || '—'],
                ['Meta matrículas', data.metaMatriculas || '—'],
                ['Aula 1', data.dataAula1 || '—'],
                ['Aula 2', data.dataAula2 || '—'],
                ['Aula 3', data.dataAula3 || '—'],
                ['Horário', data.horario],
                ['GAS URL', data.gasUrl ? '✓ Configurado' : '—'],
                ['WhatsApp', data.whatsappLink ? '✓ Configurado' : '—'],
                ['Repo captura', data.repoCaptura || '—'],
                ['Repo obrigado', data.repoObrigado || '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm border-b border-border/40 pb-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right max-w-[60%] truncate">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Etapa 6 – Resultado */}
          {etapa === 6 && (
            <div className="space-y-4 pt-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Criando repositórios e configurando deploy...</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-lg">
                    <Check className="h-6 w-6" />
                    Lançamento criado com sucesso!
                  </div>
                  {result && (
                    <div className="space-y-2">
                      {[
                        { label: '📦 Repo Captura', url: result.repoCaptura },
                        { label: '📦 Repo Obrigado', url: result.repoObrigado },
                        { label: '🌐 Página de Captura', url: result.captura },
                        { label: '🌐 Página de Obrigado', url: result.obrigado },
                      ].filter(l => l.url).map(l => (
                        <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-muted/50 transition-colors text-sm">
                          <span className="font-medium">{l.label}</span>
                          <span className="flex items-center gap-1 text-primary text-xs">
                            {l.url.replace('https://', '')}
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                  {result?.log && result.log.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Ver log detalhado</summary>
                      <div className="mt-2 bg-muted p-3 rounded font-mono space-y-0.5 max-h-40 overflow-y-auto">
                        {result.log.map((line, i) => <p key={i}>{line}</p>)}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer de navegação */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          {etapa < 6 ? (
            <>
              <Button variant="ghost" onClick={etapa === 0 ? handleClose : () => setEtapa(e => e - 1)}
                className="gap-1" disabled={loading}>
                <ChevronLeft className="h-4 w-4" />
                {etapa === 0 ? 'Cancelar' : 'Voltar'}
              </Button>

              <span className="text-xs text-muted-foreground">Etapa {etapa + 1} de {ETAPAS.length}</span>

              {etapa < 5 ? (
                <Button
                  onClick={() => setEtapa(e => e + 1)}
                  disabled={!etapaValida() || loading}
                  className="gap-1 bg-primary hover:bg-primary/90"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={criar}
                  disabled={loading || !data.nome.trim()}
                  className="gap-1 bg-primary hover:bg-primary/90"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Criar e Gerar Páginas
                </Button>
              )}
            </>
          ) : (
            <div className="flex justify-end w-full">
              <Button onClick={handleClose} className="bg-primary hover:bg-primary/90">
                Ir para o Lançamento
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
