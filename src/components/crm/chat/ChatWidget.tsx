import { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Search, X, ChevronLeft, RefreshCw } from 'lucide-react';
import { useConversas } from '@/hooks/useConversas';
import { useThread } from '@/hooks/useThread';
import {
  normalizePhone, maskPhone, fmtHora, fmtDiaSeparador, fmtRelativo,
  TEMP_CFG, TIPO_ICON, TIPO_LABEL,
} from '@/lib/chat-utils';

/** Abre o ChatWidget direto na conversa de um telefone, de qualquer tela. */
export function abrirChatWidget(telefone: string) {
  window.dispatchEvent(new CustomEvent('crm:abrir-chat', { detail: { telefone } }));
}

/**
 * Bolha flutuante estilo Facebook Messenger -- acesso rápido ao Chat em
 * qualquer tela do CRM, sem precisar navegar até Central de Disparos.
 *
 * Versão leve: busca + lista de conversas recentes (achatada, sem
 * categorias/Cobrança) + a thread selecionada. Mesmos dados de
 * useConversas()/useThread() que a aba completa (ChatConversas.tsx) usa --
 * ler aqui marca como lida lá também, e vice-versa.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [telefoneSelecionado, setTelefoneSelecionado] = useState<string | null>(null);
  const { conversas, loading } = useConversas();
  const { thread, loading: loadingThread } = useThread(telefoneSelecionado);
  const fimDaThreadRef = useRef<HTMLDivElement>(null);

  const naoLidas = conversas.filter(c => c.naoLida && c.telefone !== telefoneSelecionado).length;

  const q = busca.trim().toLowerCase();
  const conversasVisiveis = useMemo(() => {
    return conversas.filter(c => !q || c.nome.toLowerCase().includes(q) || c.telefone.includes(q));
  }, [conversas, q]);

  const selecionada = conversas.find(c => c.telefone === telefoneSelecionado) ?? null;

  useEffect(() => {
    fimDaThreadRef.current?.scrollIntoView({ block: 'end' });
  }, [telefoneSelecionado, thread]);

  useEffect(() => {
    const handler = (e: Event) => {
      const tel = normalizePhone((e as CustomEvent<{ telefone: string }>).detail?.telefone);
      if (!tel) return;
      setOpen(true);
      setTelefoneSelecionado(tel);
    };
    window.addEventListener('crm:abrir-chat', handler);
    return () => window.removeEventListener('crm:abrir-chat', handler);
  }, []);

  function fechar() {
    setOpen(false);
    setTelefoneSelecionado(null);
    setBusca('');
  }

  return (
    <>
      {open && (
        <div className={cn(
          'fixed z-[60] bg-white border rounded-xl shadow-2xl flex flex-col overflow-hidden',
          'inset-x-3 top-16 bottom-20',
          'lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-24 lg:w-[340px] lg:h-[480px]',
        )}>
          {!selecionada ? (
            <>
              <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2 flex-none bg-primary/5">
                <p className="font-semibold text-sm">Chat</p>
                <button onClick={fechar} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2 border-b flex-none">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar nome ou telefone…" value={busca}
                    onChange={e => setBusca(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : conversasVisiveis.length === 0 ? (
                  <p className="text-xs text-center text-muted-foreground py-8">Nenhuma conversa encontrada</p>
                ) : conversasVisiveis.map(c => {
                  const temp = TEMP_CFG[c.temperatura];
                  const mostraNaoLida = c.naoLida;
                  return (
                    <button key={c.telefone} onClick={() => setTelefoneSelecionado(c.telefone)}
                      className="w-full text-left px-3 py-2.5 border-b hover:bg-gray-50/60 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate flex items-center gap-1.5 min-w-0">
                          {mostraNaoLida && <span className="h-2 w-2 rounded-full bg-primary flex-none" />}
                          <temp.icon className={cn('h-3 w-3 flex-none', temp.className)} />
                          <span className={cn('truncate', mostraNaoLida && 'font-semibold')}>{c.nome}</span>
                        </p>
                        <span className="text-[10px] text-muted-foreground flex-none">{fmtRelativo(c.ultimaEm)}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {c.ultimaInstancia && `via ${c.ultimaInstancia} · `}{c.ultimaMensagem}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-2.5 border-b flex items-center gap-2 flex-none bg-primary/5">
                <button onClick={() => setTelefoneSelecionado(null)} className="text-muted-foreground hover:text-foreground flex-none">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{selecionada.nome}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {maskPhone(selecionada.telefone)}
                    {thread.length > 0 && thread[thread.length - 1].evolution_instance
                      ? ` · via ${thread[thread.length - 1].evolution_instance}` : ''}
                  </p>
                </div>
                <button onClick={fechar} className="text-muted-foreground hover:text-foreground flex-none">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 bg-gray-50/40">
                {loadingThread ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : thread.length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-8">Nenhuma mensagem ainda</p>
                ) : (
                  <div className="space-y-2">
                    {thread.map((m, i) => {
                      const diaAnterior = i > 0 ? new Date(thread[i - 1].created_at).toDateString() : null;
                      const mostraSeparador = diaAnterior !== new Date(m.created_at).toDateString();
                      const enviada = m.direcao === 'enviada';
                      const Icone = TIPO_ICON[m.tipo];
                      return (
                        <div key={m.id}>
                          {mostraSeparador && (
                            <div className="flex justify-center my-2">
                              <span className="px-2 py-0.5 rounded-full bg-white border text-[10px] text-muted-foreground">
                                {fmtDiaSeparador(m.created_at)}
                              </span>
                            </div>
                          )}
                          <div className={cn('flex', enviada ? 'justify-end' : 'justify-start')}>
                            <div className={cn('max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm',
                              enviada ? 'bg-emerald-100 text-emerald-950' : 'bg-white border')}>
                              {Icone && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium opacity-70 mb-0.5">
                                  <Icone className="h-3 w-3" /> {TIPO_LABEL[m.tipo] ?? m.tipo}
                                </span>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                              <p className="text-[10px] opacity-50 text-right mt-0.5">{fmtHora(m.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={fimDaThreadRef} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => (open ? fechar() : setOpen(true))}
        className={cn(
          'fixed z-[60] right-4 bottom-20 lg:right-6 lg:bottom-6',
          'h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg',
          'flex items-center justify-center hover:opacity-90 transition-opacity',
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && naoLidas > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground border-0">
            {naoLidas > 9 ? '9+' : naoLidas}
          </Badge>
        )}
      </button>
    </>
  );
}
