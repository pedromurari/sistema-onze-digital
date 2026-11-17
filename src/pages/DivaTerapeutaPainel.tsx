import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Save, Plus, X, LogOut, Lock, PhoneCall, CalendarDays, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Painel público do terapeuta parceiro do Divã IDM (/diva/terapeuta/:id).
 * Login por WhatsApp + PIN de 6 dígitos (gerado pelo admin em
 * FichaTerapeutaDialog) -- o link em si não é mais o acesso, só a porta;
 * quem abre precisa logar. Duas seções: sessões vendidas pelo IDM (só
 * leitura) e disponibilidade dos próximos 30 dias (o próprio terapeuta
 * marca/ajusta e salva via diva-disponibilidade-salvar).
 */

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const TOKEN_KEY = 'diva_terapeuta_token';
const DADOS_KEY = 'diva_terapeuta_dados';

interface SessaoPainel {
  data_sessao: string; horario_inicio: string | null; horario_fim: string | null;
  cliente_nome: string; cliente_whatsapp: string | null; tipo: string;
  quantidade_sessoes: number; valor_total: number; status_pagamento: string;
}
interface Bloco { inicio: string; fim: string; }

function chaveData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatarDataExtensa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const data = new Date(y, m - 1, d);
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '');
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

function linkWhatsapp(numero: string): string {
  return `https://wa.me/55${numero.replace(/\D/g, '')}`;
}

function salvarSessao(token: string, terapeutaId: string, nome: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(DADOS_KEY, JSON.stringify({ terapeuta_id: terapeutaId, nome }));
}

function lerSessao(): { token: string; terapeuta_id: string; nome: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const dadosRaw = localStorage.getItem(DADOS_KEY);
  if (!token || !dadosRaw) return null;
  try {
    const dados = JSON.parse(dadosRaw);
    return { token, terapeuta_id: dados.terapeuta_id, nome: dados.nome };
  } catch {
    return null;
  }
}

function limparSessao() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(DADOS_KEY);
}

// ───────────────────────── Tela de login ─────────────────────────

function TelaLogin({ onEntrou }: { onEntrou: (token: string, terapeutaId: string, nome: string) => void }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [pin, setPin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const entrar = async () => {
    if (!whatsapp || pin.length < 4) {
      setErro('Preenche o WhatsApp e o PIN.');
      return;
    }
    setEntrando(true);
    setErro(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/diva-terapeuta-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Não foi possível entrar.');
      salvarSessao(data.token, data.terapeuta_id, data.nome);
      onEntrou(data.token, data.terapeuta_id, data.nome);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha de conexão.');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A1020] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={IDM_LOGO} alt="" className="h-10 mb-4" />
          <p className="text-[11px] font-bold tracking-[0.2em] text-[#C9A227] uppercase">Divã IDM</p>
          <h1 className="text-2xl font-bold text-[#F5F0E4] mt-1">Entrar no meu painel</h1>
        </div>

        <div className="bg-[#FAFAF7] rounded-2xl p-6 shadow-xl flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[#1C1C1A]">Seu WhatsApp</label>
            <Input
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="h-12 text-base"
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[#1C1C1A]">PIN de 6 dígitos</label>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="h-12 text-base tracking-[0.3em] text-center"
              onKeyDown={(e) => e.key === 'Enter' && void entrar()}
            />
            <p className="text-xs text-[#6B6B5F]">O PIN foi enviado pra você pelo WhatsApp do IDM. Perdeu? Chama a gente.</p>
          </div>

          {erro && <p className="text-sm text-red-600 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0" /> {erro}</p>}

          <Button onClick={() => void entrar()} disabled={entrando} className="h-12 text-base gap-2 mt-1">
            {entrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {entrando ? 'Entrando...' : 'Entrar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Painel ─────────────────────────

export default function DivaTerapeutaPainel() {
  const { terapeutaId: terapeutaIdDaUrl } = useParams<{ terapeutaId: string }>();
  const [sessao, setSessao] = useState<{ token: string; terapeuta_id: string; nome: string } | null>(() => lerSessao());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoPainel[]>([]);
  const [horariosPorDia, setHorariosPorDia] = useState<Record<string, Bloco[]>>({});
  const [diasSelecionados, setDiasSelecionados] = useState<Date[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [sessaoAberta, setSessaoAberta] = useState<SessaoPainel | null>(null);

  const sessoesComData = useMemo(() => sessoes.filter((s) => !!s.data_sessao), [sessoes]);

  const sessoesPorData = useMemo(() => {
    const mapa: Record<string, SessaoPainel[]> = {};
    for (const s of sessoesComData) (mapa[s.data_sessao] ??= []).push(s);
    return mapa;
  }, [sessoesComData]);

  const diasComSessao = useMemo(
    () => sessoesComData.map((s) => { const [y, m, d] = s.data_sessao.split('-').map(Number); return new Date(y, m - 1, d); }),
    [sessoesComData],
  );

  const abrirFichaPorDia = (dia: Date | undefined) => {
    if (!dia) return;
    const lista = sessoesPorData[chaveData(dia)];
    if (lista?.length) setSessaoAberta(lista[0]);
  };

  const carregarPainel = async (token: string) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/diva-terapeuta-painel`, {
        headers: { 'x-diva-token': token },
      });
      if (res.status === 401) {
        limparSessao();
        setSessao(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Não foi possível carregar o painel.');

      setSessoes((data.sessoes as SessaoPainel[]) ?? []);

      const porDia: Record<string, Bloco[]> = {};
      for (const slot of (data.disponibilidade as Array<{ data: string; horario_inicio: string; horario_fim: string }>) ?? []) {
        (porDia[slot.data] ??= []).push({ inicio: slot.horario_inicio.slice(0, 5), fim: slot.horario_fim.slice(0, 5) });
      }
      setHorariosPorDia(porDia);
      setDiasSelecionados(Object.keys(porDia).map((d) => new Date(`${d}T00:00:00`)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha de conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessao) void carregarPainel(sessao.token);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token]);

  const alternarDias = (dias: Date[] | undefined) => {
    const novos = dias ?? [];
    setDiasSelecionados(novos);
    setHorariosPorDia((prev) => {
      const atualizado: Record<string, Bloco[]> = {};
      for (const d of novos) {
        const chave = chaveData(d);
        atualizado[chave] = prev[chave] ?? [{ inicio: '09:00', fim: '10:00' }];
      }
      return atualizado;
    });
  };

  const atualizarHorario = (chave: string, idx: number, campo: 'inicio' | 'fim', valor: string) => {
    setHorariosPorDia((prev) => {
      const lista = [...(prev[chave] ?? [])];
      lista[idx] = { ...lista[idx], [campo]: valor };
      return { ...prev, [chave]: lista };
    });
  };

  const adicionarBloco = (chave: string) => {
    setHorariosPorDia((prev) => ({ ...prev, [chave]: [...(prev[chave] ?? []), { inicio: '14:00', fim: '15:00' }] }));
  };

  const removerBloco = (chave: string, idx: number) => {
    setHorariosPorDia((prev) => ({ ...prev, [chave]: (prev[chave] ?? []).filter((_, i) => i !== idx) }));
  };

  const salvar = async () => {
    if (!sessao || salvando) return;
    setSalvando(true);
    const slots = Object.entries(horariosPorDia).flatMap(([data, blocos]) =>
      blocos.filter((b) => b.fim > b.inicio).map((b) => ({ data, horario_inicio: b.inicio, horario_fim: b.fim })),
    );
    try {
      const res = await fetch(`${FUNCTIONS_URL}/diva-disponibilidade-salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-diva-token': sessao.token },
        body: JSON.stringify({ slots }),
      });
      if (res.status === 401) { limparSessao(); setSessao(null); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Não foi possível salvar.');
      toast.success('Disponibilidade salva!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const sair = () => {
    limparSessao();
    setSessao(null);
  };

  if (!sessao) {
    return (
      <TelaLogin
        onEntrou={(token, terapeutaId, nome) => {
          setSessao({ token, terapeuta_id: terapeutaId, nome });
          if (terapeutaIdDaUrl && terapeutaIdDaUrl !== terapeutaId) {
            window.history.replaceState(null, '', `/diva/terapeuta/${terapeutaId}`);
          }
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A1020]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F5F0E4]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0EFE9]">
      <div className="bg-[#0A1020] px-5 py-7 text-center relative">
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A227] to-transparent" />
        <div className="flex items-center justify-between max-w-xl mx-auto mb-3">
          <img src={IDM_LOGO} alt="" className="h-8" />
          <button onClick={sair} className="flex items-center gap-1.5 text-xs text-[#F5F0E4]/60 hover:text-[#F5F0E4] transition-colors">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
        <p className="text-[11px] font-bold tracking-[0.2em] text-[#C9A227] uppercase">Divã IDM</p>
        <h1 className="text-xl font-bold text-[#F5F0E4] mt-1">{sessao.nome}</h1>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-5">
        {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{erro}</p>}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-4.5 w-4.5 text-[#C9A227]" /> Minhas sessões</CardTitle>
            <CardDescription>Sessões vendidas pelo IDM. Toque num dia marcado ou numa sessão pra ver a ficha completa do cliente.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sessoesComData.length > 0 && (
              <Calendar
                mode="single"
                selected={undefined}
                onSelect={abrirFichaPorDia}
                disabled={(dia) => !sessoesPorData[chaveData(dia)]}
                modifiers={{ temSessao: diasComSessao }}
                modifiersClassNames={{ temSessao: 'relative font-semibold text-foreground after:content-[\'\'] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-[#C9A227]' }}
                className="rounded-xl border mx-auto bg-background"
              />
            )}

            {sessoes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhuma sessão agendada ainda.</p>
            ) : (
              sessoes.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSessaoAberta(s)}
                  className="flex gap-3 border rounded-xl p-3.5 bg-muted/30 text-left hover:border-[#C9A227]/60 hover:bg-muted/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-[#1C2B4A] text-[#F5F0E4] flex items-center justify-center font-semibold text-sm shrink-0">
                    {iniciais(s.cliente_nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight">{s.cliente_nome}</p>
                      {s.tipo === 'reserva' ? (
                        <Badge variant="secondary">Compromisso</Badge>
                      ) : (
                        <Badge variant={s.status_pagamento === 'pago' ? 'default' : 'secondary'} className={s.status_pagamento === 'pago' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                          {s.status_pagamento === 'pago' ? 'Confirmada' : 'Pendente'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {s.data_sessao ? formatarDataExtensa(s.data_sessao) : 'Data a combinar'}
                      {s.horario_inicio ? ` · ${s.horario_inicio.slice(0, 5)}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {s.tipo === 'reserva'
                        ? 'Compromisso pessoal'
                        : `${s.tipo === 'pacote' ? `Pacote de ${s.quantidade_sessoes} sessões` : 'Sessão avulsa'} · ${Number(s.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                    </p>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="h-4.5 w-4.5 text-[#C9A227]" /> Minha disponibilidade</CardTitle>
            <CardDescription>Toque nos dias livres dos próximos 30 dias e ajuste o horário. Dias com um pontinho já têm sessão marcada.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Calendar
              mode="multiple"
              selected={diasSelecionados}
              onSelect={alternarDias}
              fromDate={new Date()}
              toDate={new Date(Date.now() + 30 * 86400000)}
              modifiers={{ temSessao: diasComSessao }}
              modifiersClassNames={{ temSessao: 'relative after:content-[\'\'] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-emerald-500' }}
              className="rounded-xl border mx-auto bg-background"
            />

            {Object.keys(horariosPorDia).sort().map((chave) => (
              <div key={chave} className="border rounded-xl p-3.5 bg-muted/30">
                <p className="font-semibold text-sm mb-2.5">{formatarDataExtensa(chave)}</p>
                {(horariosPorDia[chave] ?? []).map((bloco, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-2">
                    <Input type="time" value={bloco.inicio} onChange={(e) => atualizarHorario(chave, idx, 'inicio', e.target.value)} className="h-11 text-base w-[7.5rem]" />
                    <span className="text-sm text-muted-foreground">às</span>
                    <Input type="time" value={bloco.fim} onChange={(e) => atualizarHorario(chave, idx, 'fim', e.target.value)} className="h-11 text-base w-[7.5rem]" />
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0 ml-auto" onClick={() => removerBloco(chave, idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="gap-1.5 mt-1" onClick={() => adicionarBloco(chave)}>
                  <Plus className="h-3.5 w-3.5" /> outro horário
                </Button>
              </div>
            ))}

            <Button onClick={() => void salvar()} disabled={salvando} className="h-12 text-base gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {salvando ? 'Salvando...' : 'Salvar disponibilidade'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!sessaoAberta} onOpenChange={(v) => { if (!v) setSessaoAberta(null); }}>
        <DialogContent className="max-w-sm">
          {sessaoAberta && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-[#1C2B4A] text-[#F5F0E4] flex items-center justify-center font-semibold shrink-0">
                    {iniciais(sessaoAberta.cliente_nome)}
                  </div>
                  <div>
                    <DialogTitle className="text-lg leading-tight">{sessaoAberta.cliente_nome}</DialogTitle>
                    <DialogDescription>Ficha da sessão</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-3 pt-1">
                {sessaoAberta.tipo === 'reserva' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tipo</span>
                    <Badge variant="secondary">Compromisso pessoal (não é venda do IDM)</Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={sessaoAberta.status_pagamento === 'pago' ? 'default' : 'secondary'} className={sessaoAberta.status_pagamento === 'pago' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                      {sessaoAberta.status_pagamento === 'pago' ? 'Pagamento confirmado' : 'Pagamento pendente'}
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Data / horário</span>
                  <span className="text-sm font-medium">
                    {sessaoAberta.data_sessao ? formatarDataExtensa(sessaoAberta.data_sessao) : 'A combinar'}
                    {sessaoAberta.horario_inicio ? ` · ${sessaoAberta.horario_inicio.slice(0, 5)}` : ''}
                  </span>
                </div>

                {sessaoAberta.tipo !== 'reserva' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Plano</span>
                      <span className="text-sm font-medium">
                        {sessaoAberta.tipo === 'pacote' ? `Pacote de ${sessaoAberta.quantidade_sessoes} sessões` : 'Sessão avulsa'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Valor</span>
                      <span className="text-sm font-medium">{Number(sessaoAberta.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                  </>
                )}

                {sessaoAberta.cliente_whatsapp ? (
                  <a
                    href={linkWhatsapp(sessaoAberta.cliente_whatsapp)}
                    target="_blank" rel="noreferrer"
                    className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white py-2.5 text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <PhoneCall className="h-4 w-4" /> Chamar {sessaoAberta.cliente_nome.split(' ')[0]} no WhatsApp
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">Sem WhatsApp do cliente cadastrado.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
