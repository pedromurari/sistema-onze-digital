import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search, MessageSquare, Smartphone, ChevronLeft, QrCode, RefreshCw, Loader2, XCircle, CheckCircle2, Settings2,
} from 'lucide-react';
import { useConversas } from '@/hooks/useConversas';
import { useThread } from '@/hooks/useThread';
import { ConnStateBadge } from '../ConnStateBadge';
import {
  fetchConnectionState, fetchQrCode, configurarWebhookRespostas,
  type ConnState, type EvolutionInstance,
} from '@/lib/evolution-status';
import {
  maskPhone, fmtHora, fmtDiaSeparador, fmtRelativo, TIPO_ICON, TIPO_LABEL,
} from '@/lib/chat-utils';

/**
 * Chat do Time Comercial: o vendedor conecta o proprio WhatsApp por QR code e
 * le o historico das conversas que passaram por ele. Somente leitura.
 *
 * O escopo e' o NUMERO, nao o dono do lead: o vendedor ve o que o WhatsApp dele
 * trocou, e nada do que outro numero (IDM, disparo, o colega) conversou com o
 * mesmo lead.
 *
 * Quem ve o que: a configuracao da Evolution (qual numero, vincular, apontar
 * webhook) e' so pra admin. O vendedor ve o cartao de conexao -- status e QR --
 * e a caixa de entrada, sem nome de instancia nem nada de infra.
 *
 * De onde vem a mensagem: `whatsapp_mensagens`, alimentada pelo webhook
 * evo-resposta. Instancia conectada sem webhook apontado nao grava nada, por
 * isso vincular o numero ja configura o webhook junto.
 */

// Corte do historico. Os numeros dos vendedores entraram no sistema agora --
// mensagem anterior a isso, se existir no numero, e' de outro uso e nao e'
// conversa de venda deles.
const HISTORICO_DESDE = '2026-08-21';

const POLL_CONEXAO_MS = 5000;

interface VendedorNumero {
  usuarioId: string;
  nome: string;
  inst: EvolutionInstance;
}

/** Vendedor -> instancia da Evolution, de lead_aquecimento_vendedores. */
function useNumerosDosVendedores() {
  const { users } = useAuth();
  const [numeros, setNumeros] = useState<VendedorNumero[] | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('lead_aquecimento_vendedores' as any)
      .select('usuario_id, evolution_config:evolution_config_id(id, instance_name, api_url, api_key, ativo)');

    const lista: VendedorNumero[] = [];
    for (const row of ((data ?? []) as any[])) {
      const inst = row.evolution_config as EvolutionInstance | null;
      const nome = users.find(u => u.id === row.usuario_id)?.nome;
      // `ativo` aqui e' do rodizio de isca do Aquecimento, nao do Chat:
      // vendedor fora do rodizio continua tendo direito ao proprio historico.
      if (inst?.instance_name && nome) lista.push({ usuarioId: row.usuario_id, nome, inst });
    }
    setNumeros(lista);
  }, [users]);

  useEffect(() => { carregar(); }, [carregar]);

  return { numeros, recarregar: carregar };
}

/** Estado de conexao de uma instancia, com polling enquanto `ativo`. */
function useConnState(inst: EvolutionInstance | null, ativo: boolean) {
  const [state, setState] = useState<ConnState>('loading');

  useEffect(() => {
    if (!inst) { setState('unknown'); return; }
    let cancelado = false;
    const checar = async () => {
      const s = await fetchConnectionState(inst);
      if (!cancelado) setState(s);
    };
    checar();
    if (!ativo) return () => { cancelado = true; };
    const id = setInterval(checar, POLL_CONEXAO_MS);
    return () => { cancelado = true; clearInterval(id); };
  }, [inst, ativo]);

  return state;
}

function QrDialog({ inst, aberto, onFechar }: {
  inst: EvolutionInstance | null; aberto: boolean; onFechar: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const state = useConnState(inst, aberto);

  const gerar = useCallback(async () => {
    if (!inst) return;
    setCarregando(true);
    setQr(await fetchQrCode(inst));
    setCarregando(false);
  }, [inst]);

  useEffect(() => { if (aberto) gerar(); else setQr(null); }, [aberto, gerar]);

  // Conectou: fecha sozinho, pro vendedor nao ficar olhando pro QR ja usado.
  useEffect(() => {
    if (aberto && state === 'open') {
      toast.success('WhatsApp conectado!', { description: 'A partir de agora as conversas aparecem no histórico.' });
      onFechar();
    }
  }, [aberto, state, onFechar]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        {carregando ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando QR code...</p>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-4">
            <ol className="text-xs text-muted-foreground space-y-1 self-start">
              <li>1. Abra o WhatsApp no celular</li>
              <li>2. Toque em <span className="font-medium text-foreground">Aparelhos conectados</span></li>
              <li>3. Toque em <span className="font-medium text-foreground">Conectar aparelho</span> e aponte pro código</li>
            </ol>
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code do WhatsApp"
              className="w-56 h-56 rounded-lg border border-border"
            />
            <div className="flex items-center gap-2">
              <ConnStateBadge state={state} />
              <Button variant="outline" size="sm" className="gap-1" onClick={gerar}>
                <RefreshCw className="h-3.5 w-3.5" />Gerar novo
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">O código expira em pouco tempo. Se der erro, gere um novo.</p>
          </div>
        ) : state === 'open' ? (
          // Instancia ja conectada nao devolve QR -- isso e' sucesso, nao erro.
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="text-sm font-medium text-foreground">Esse WhatsApp já está conectado.</p>
            <p className="text-xs text-muted-foreground">Não precisa fazer nada — as conversas já estão sendo salvas.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Não foi possível gerar o QR code agora.</p>
            <Button variant="outline" size="sm" onClick={gerar}>Tentar de novo</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cartao que o vendedor ve: status do proprio numero e o botao de conectar. */
function ConexaoCard({ inst, titulo }: { inst: EvolutionInstance | null; titulo: string }) {
  const [qrAberto, setQrAberto] = useState(false);
  const state = useConnState(inst, false);
  const conectado = state === 'open';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            conectado ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
          )}>
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{titulo}</p>
            <p className="text-xs text-muted-foreground">
              {conectado
                ? 'Conectado — as conversas estão sendo salvas no histórico.'
                : 'Conecte pra começar a guardar o histórico das suas conversas.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ConnStateBadge state={state} />
          <Button size="sm" variant={conectado ? 'outline' : 'default'} className="gap-1.5" onClick={() => setQrAberto(true)}>
            <QrCode className="h-3.5 w-3.5" />{conectado ? 'Reconectar' : 'Conectar'}
          </Button>
        </div>
      </div>
      <QrDialog inst={inst} aberto={qrAberto} onFechar={() => setQrAberto(false)} />
    </Card>
  );
}

/**
 * Painel de infra: so admin. Vincula um numero da Evolution ao vendedor e aponta
 * o webhook.
 *
 * Nao cria a instancia: `POST /instance/create` exige a chave GLOBAL do servidor
 * Evolution, e o que existe em `evolution_config` sao chaves por instancia (9
 * chaves distintas pra 9 instancias) -- o servidor devolve 401. A instancia
 * nasce no painel da Evolution; aqui ela so e' ligada ao vendedor.
 */
function ConfigEvolutionAdmin({ vendedores, numeros, onMudou }: {
  vendedores: string[]; numeros: VendedorNumero[]; onMudou: () => void;
}) {
  const { users } = useAuth();
  const [instancias, setInstancias] = useState<EvolutionInstance[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Os vendedores do time vem de quem chamou (INITIAL_VENDORS, a lista do Time
  // Comercial) -- so Helen e Miguel. A conta no sistema e' o que da o usuario_id
  // que lead_aquecimento_vendedores exige.
  const doTime = vendedores.map(nome => ({ nome, conta: users.find(u => u.nome === nome) }));

  useEffect(() => {
    supabase.from('evolution_config').select('id, instance_name, api_url, api_key, ativo').order('instance_name')
      .then(({ data }) => setInstancias((data ?? []) as EvolutionInstance[]));
  }, []);

  const jaVinculadas = new Set(numeros.map(n => n.inst.id));

  async function vincular(usuarioId: string, instanciaId: string) {
    setSalvando(usuarioId);
    try {
      const inst = instancias.find(i => i.id === instanciaId);
      if (!inst) return;

      // ativo=false de proposito: esse flag e' do rodizio de isca do Aquecimento.
      // O Chat nao depende dele; entrar no rodizio e' decisao separada, la.
      const { error } = await supabase.from('lead_aquecimento_vendedores' as any)
        .insert({ usuario_id: usuarioId, evolution_config_id: instanciaId, ativo: false } as any);
      if (error) { toast.error('Erro ao vincular', { description: error.message }); return; }

      // Sem webhook a instancia conecta e nao grava nada -- o Chat ficaria vazio.
      const webhookOk = await configurarWebhookRespostas(inst);
      if (webhookOk) {
        toast.success(`Número vinculado`, { description: 'Webhook apontado. Agora é só o vendedor ler o QR code.' });
      } else {
        toast.error('Vinculado, mas o webhook falhou', { description: 'Sem webhook nada é gravado. Confira a instância na Evolution.' });
      }
      onMudou();
    } finally {
      setSalvando(null);
    }
  }

  async function desvincular(usuarioId: string) {
    setSalvando(usuarioId);
    const { error } = await supabase.from('lead_aquecimento_vendedores' as any).delete().eq('usuario_id', usuarioId);
    setSalvando(null);
    if (error) { toast.error('Erro ao desvincular', { description: error.message }); return; }
    onMudou();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Configuração da Evolution</h3>
        <Badge className="text-[10px] border-0 bg-muted text-muted-foreground">só admin</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Cada vendedor usa um número próprio. Crie a instância no painel da Evolution, escolha ela aqui, e o sistema aponta o webhook — sem webhook nada é gravado e o histórico fica vazio.
      </p>

      <div className="flex flex-col divide-y divide-border">
        {doTime.map(({ nome, conta }) => {
          const numero = numeros.find(n => n.nome === nome);
          const disponiveis = instancias.filter(i => !jaVinculadas.has(i.id));
          return (
            <div key={nome} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0 flex-wrap">
              <div>
                <p className="text-sm font-medium text-foreground">{nome}</p>
                <p className="text-xs text-muted-foreground">
                  {numero ? `número: ${numero.inst.instance_name}` : conta ? 'sem número vinculado' : 'sem conta no sistema'}
                </p>
              </div>
              {numero ? (
                <div className="flex items-center gap-2">
                  <LinhaInstanciaAdmin inst={numero.inst} />
                  <Button size="sm" variant="ghost" className="text-xs h-8" disabled={salvando === conta?.id} onClick={() => conta && desvincular(conta.id)}>
                    Desvincular
                  </Button>
                </div>
              ) : conta ? (
                <Select disabled={salvando === conta.id} onValueChange={v => vincular(conta.id, v)}>
                  <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Escolher número..." /></SelectTrigger>
                  <SelectContent>
                    {disponiveis.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum número livre na Evolution</div>
                    ) : disponiveis.map(i => (
                      <SelectItem key={i.id} value={i.id} className="text-xs">{i.instance_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">cadastre em Equipe primeiro</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LinhaInstanciaAdmin({ inst }: { inst: EvolutionInstance }) {
  const [qrAberto, setQrAberto] = useState(false);
  const state = useConnState(inst, false);
  return (
    <div className="flex items-center gap-2">
      <ConnStateBadge state={state} />
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setQrAberto(true)}>
        <QrCode className="h-3.5 w-3.5" />QR
      </Button>
      <QrDialog inst={inst} aberto={qrAberto} onFechar={() => setQrAberto(false)} />
    </div>
  );
}

function ConversaItem({ nome, telefone, previa, quando, naoLida, ativo, onClick }: {
  nome: string; telefone: string; previa: string; quando: string;
  naoLida: boolean; ativo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/60 transition-colors',
        ativo && 'bg-muted',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-sm truncate', naoLida ? 'font-bold text-foreground' : 'font-medium text-foreground')}>{nome}</p>
        <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtRelativo(quando)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-xs text-muted-foreground truncate">{previa}</p>
        {naoLida && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{maskPhone(telefone)}</p>
    </button>
  );
}

function Thread({ telefone, instancias }: { telefone: string; instancias: string[] }) {
  const { thread, loading } = useThread(telefone, instancias, HISTORICO_DESDE);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length]);

  if (loading) return <p className="text-xs text-muted-foreground p-4">Carregando conversa...</p>;
  if (!thread.length) return <p className="text-xs text-muted-foreground p-4">Nenhuma mensagem com esse número ainda.</p>;

  let diaAnterior = '';
  return (
    <div className="flex flex-col gap-1.5 p-4">
      {thread.map(m => {
        const dia = fmtDiaSeparador(m.created_at);
        const mostraDia = dia !== diaAnterior;
        diaAnterior = dia;
        const enviada = m.direcao === 'enviada';
        const Icone = TIPO_ICON[m.tipo];
        return (
          <div key={m.id}>
            {mostraDia && (
              <div className="flex justify-center my-3">
                <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2.5 py-0.5">{dia}</span>
              </div>
            )}
            <div className={cn('flex', enviada ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[75%] rounded-lg px-3 py-2',
                enviada ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              )}>
                {m.tipo !== 'text' ? (
                  <p className="text-sm flex items-center gap-1.5 italic">
                    {Icone && <Icone className="h-3.5 w-3.5" />}
                    {TIPO_LABEL[m.tipo] ?? 'Mensagem'}
                  </p>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                )}
                <p className={cn('text-[10px] mt-0.5', enviada ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {fmtHora(m.created_at)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={fimRef} />
    </div>
  );
}

function CaixaDeEntrada({ instancias, escopoPessoal }: { instancias: string[]; escopoPessoal: boolean }) {
  const { conversas, loading } = useConversas(instancias, HISTORICO_DESDE);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return conversas;
    return conversas.filter(c => c.nome.toLowerCase().includes(termo) || c.telefone.includes(termo.replace(/\D/g, '')));
  }, [conversas, busca]);

  const conversaAtiva = conversas.find(c => c.telefone === ativo) ?? null;

  return (
    <Card className="overflow-hidden">
      <div className="flex h-[560px]">
        <div className={cn('w-full sm:w-72 border-r border-border flex flex-col flex-shrink-0', ativo && 'hidden sm:flex')}>
          <div className="p-2.5 border-b border-border">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="h-8 text-xs pl-8"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {escopoPessoal ? 'Conversas do seu WhatsApp' : `Conversas do time · ${instancias.join(', ')}`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-muted-foreground p-3">Carregando conversas...</p>
            ) : filtradas.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">
                {busca ? 'Nenhuma conversa com esse nome ou telefone.' : 'Nenhuma conversa ainda — ela aparece assim que alguém falar com esse número.'}
              </p>
            ) : filtradas.map(c => (
              <ConversaItem
                key={c.telefone}
                nome={c.nome}
                telefone={c.telefone}
                previa={c.ultimaMensagem}
                quando={c.ultimaEm}
                naoLida={c.naoLida}
                ativo={c.telefone === ativo}
                onClick={() => setAtivo(c.telefone)}
              />
            ))}
          </div>
        </div>

        <div className={cn('flex-1 flex flex-col min-w-0', !ativo && 'hidden sm:flex')}>
          {!conversaAtiva ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="h-6 w-6" />
              <p className="text-xs">Escolha uma conversa pra ver o histórico.</p>
            </div>
          ) : (
            <>
              <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAtivo(null)}
                  className="sm:hidden h-7 w-7 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors flex-shrink-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{conversaAtiva.nome}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {maskPhone(conversaAtiva.telefone)} · {conversaAtiva.grupoNome}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Thread telefone={conversaAtiva.telefone} instancias={instancias} />
              </div>
              <p className="text-[10px] text-muted-foreground px-3 py-2 border-t border-border">
                Somente leitura — responder continua sendo pelo WhatsApp.
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ChatTimeComercial({ viewAsName, vendedores }: { viewAsName: string | null; vendedores: string[] }) {
  const { user } = useAuth();
  const { numeros, recarregar } = useNumerosDosVendedores();
  // Admin de verdade, nao "ver como": quem entrou como admin continua admin
  // enquanto olha a tela pela perspectiva de um vendedor.
  const isAdmin = user?.tipo === 'admin';

  const doEscopo = useMemo(() => {
    if (!numeros) return null;
    return viewAsName ? numeros.filter(n => n.nome === viewAsName) : numeros;
  }, [numeros, viewAsName]);

  if (numeros === null) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  const instancias = (doEscopo ?? []).map(n => n.inst.instance_name);
  const meuNumero = viewAsName ? (doEscopo?.[0]?.inst ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Conexao: o vendedor so precisa disso -- status e QR do proprio numero. */}
      {viewAsName ? (
        meuNumero ? (
          <ConexaoCard inst={meuNumero} titulo="Seu WhatsApp" />
        ) : (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Seu WhatsApp ainda não foi liberado</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  Peça pro admin liberar o seu número aqui no Chat. Depois disso aparece um QR code nesta tela pra você conectar.
                </p>
              </div>
            </div>
          </Card>
        )
      ) : null}

      {isAdmin && <ConfigEvolutionAdmin vendedores={vendedores} numeros={numeros} onMudou={recarregar} />}

      {instancias.length > 0 && (
        <CaixaDeEntrada instancias={instancias} escopoPessoal={!!viewAsName} />
      )}
    </div>
  );
}
