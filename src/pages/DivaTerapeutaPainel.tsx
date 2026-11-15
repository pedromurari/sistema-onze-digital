import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Save, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import './matricula/matricula-reference.css';

/**
 * Painel público do terapeuta parceiro do Divã IDM (/diva/terapeuta/:id).
 * Sem login -- o link em si (UUID não-adivinhável) é o acesso, mesmo
 * padrão de diva-terapeuta-conectar-mp. Duas seções: sessões vendidas
 * pelo IDM (só leitura) e disponibilidade dos próximos 30 dias (o próprio
 * terapeuta marca/ajusta e salva via diva-disponibilidade-salvar).
 */

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface SessaoPainel {
  data_sessao: string; horario_inicio: string | null; horario_fim: string | null;
  cliente_nome: string; status_pagamento: string;
}
interface Bloco { inicio: string; fim: string; }

function chaveData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatarDataBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function DivaTerapeutaPainel() {
  const { terapeutaId } = useParams<{ terapeutaId: string }>();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [sessoes, setSessoes] = useState<SessaoPainel[]>([]);
  const [horariosPorDia, setHorariosPorDia] = useState<Record<string, Bloco[]>>({});
  const [diasSelecionados, setDiasSelecionados] = useState<Date[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!terapeutaId) return;
    let ativo = true;
    (async () => {
      setLoading(true);
      setErro(null);
      try {
        const res = await fetch(`${FUNCTIONS_URL}/diva-terapeuta-painel?terapeuta_id=${terapeutaId}`);
        const data = await res.json();
        if (!ativo) return;
        if (!res.ok) throw new Error(data?.error || 'Não foi possível carregar o painel.');

        setNome(data.terapeuta?.nome ?? '');
        setSessoes((data.sessoes as SessaoPainel[]) ?? []);

        const porDia: Record<string, Bloco[]> = {};
        for (const slot of (data.disponibilidade as Array<{ data: string; horario_inicio: string; horario_fim: string }>) ?? []) {
          (porDia[slot.data] ??= []).push({ inicio: slot.horario_inicio.slice(0, 5), fim: slot.horario_fim.slice(0, 5) });
        }
        setHorariosPorDia(porDia);
        setDiasSelecionados(Object.keys(porDia).map(d => new Date(`${d}T00:00:00`)));
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha de conexão.');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [terapeutaId]);

  const alternarDias = (dias: Date[] | undefined) => {
    const novos = dias ?? [];
    setDiasSelecionados(novos);
    setHorariosPorDia(prev => {
      const atualizado: Record<string, Bloco[]> = {};
      for (const d of novos) {
        const chave = chaveData(d);
        atualizado[chave] = prev[chave] ?? [{ inicio: '09:00', fim: '10:00' }];
      }
      return atualizado;
    });
  };

  const atualizarHorario = (chave: string, idx: number, campo: 'inicio' | 'fim', valor: string) => {
    setHorariosPorDia(prev => {
      const lista = [...(prev[chave] ?? [])];
      lista[idx] = { ...lista[idx], [campo]: valor };
      return { ...prev, [chave]: lista };
    });
  };

  const adicionarBloco = (chave: string) => {
    setHorariosPorDia(prev => ({ ...prev, [chave]: [...(prev[chave] ?? []), { inicio: '14:00', fim: '15:00' }] }));
  };

  const removerBloco = (chave: string, idx: number) => {
    setHorariosPorDia(prev => ({ ...prev, [chave]: (prev[chave] ?? []).filter((_, i) => i !== idx) }));
  };

  const salvar = async () => {
    if (!terapeutaId || salvando) return;
    setSalvando(true);
    const slots = Object.entries(horariosPorDia).flatMap(([data, blocos]) =>
      blocos.filter(b => b.fim > b.inicio).map(b => ({ data, horario_inicio: b.inicio, horario_fim: b.fim })),
    );
    try {
      const res = await fetch(`${FUNCTIONS_URL}/diva-disponibilidade-salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terapeuta_id: terapeutaId, slots }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Não foi possível salvar.');
      toast.success('Disponibilidade salva!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="idm-matricula" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy-deeper)' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#fff' }} />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="idm-matricula">
        <div className="pay-header">
          <div className="pay-header-badge">Instituto Despertamente</div>
          <h2 className="pay-header-title">Link indisponível</h2>
          <p className="pay-header-name">{erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="idm-matricula">
      <div className="pay-header">
        <img src={IDM_LOGO} alt="" style={{ height: 40, marginBottom: 12 }} />
        <div className="pay-header-badge">Divã IDM</div>
        <h2 className="pay-header-title">{nome}</h2>
        <p className="pay-header-name">Painel do terapeuta parceiro</p>
      </div>

      <div className="pay-body">
        <div className="pay-card active" style={{ marginBottom: 16 }}>
          <div className="pay-card-header">
            <div className="pay-card-info">
              <div className="pay-card-title">Minhas sessões</div>
              <div className="pay-card-sub">Sessões vendidas pelo IDM, a partir de hoje</div>
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {sessoes.length === 0 ? (
              <p style={{ fontSize: 14, color: '#8A8372' }}>Nenhuma sessão agendada ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sessoes.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, borderBottom: '1px solid #EEE8D8', paddingBottom: 8 }}>
                    <span>{formatarDataBR(s.data_sessao)}{s.horario_inicio ? ` · ${s.horario_inicio.slice(0, 5)}` : ''}</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>{s.cliente_nome}</span>
                    <span style={{ color: s.status_pagamento === 'pago' ? '#1E7A3E' : '#B8960C', fontWeight: 600 }}>
                      {s.status_pagamento === 'pago' ? 'Confirmada' : 'Pendente'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pay-card active">
          <div className="pay-card-header">
            <div className="pay-card-info">
              <div className="pay-card-title">Minha disponibilidade</div>
              <div className="pay-card-sub">Toque nos dias livres nos próximos 30 dias e ajuste o horário</div>
            </div>
          </div>
          <div style={{ padding: '0 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Calendar
              mode="multiple"
              selected={diasSelecionados}
              onSelect={alternarDias}
              fromDate={new Date()}
              toDate={new Date(Date.now() + 30 * 86400000)}
              className="rounded-md border mx-auto"
            />

            {Object.keys(horariosPorDia).sort().map(chave => (
              <div key={chave} style={{ border: '1px solid #EEE8D8', borderRadius: 10, padding: 12 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{formatarDataBR(chave)}</p>
                {(horariosPorDia[chave] ?? []).map((bloco, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <Input type="time" value={bloco.inicio} onChange={e => atualizarHorario(chave, idx, 'inicio', e.target.value)} className="h-8 w-28" />
                    <span style={{ fontSize: 13, color: '#8A8372' }}>às</span>
                    <Input type="time" value={bloco.fim} onChange={e => atualizarHorario(chave, idx, 'fim', e.target.value)} className="h-8 w-28" />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removerBloco(chave, idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="gap-1 mt-1" onClick={() => adicionarBloco(chave)}>
                  <Plus className="h-3.5 w-3.5" /> outro horário
                </Button>
              </div>
            ))}

            <Button onClick={() => void salvar()} disabled={salvando} className="gap-1.5">
              <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar disponibilidade'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
