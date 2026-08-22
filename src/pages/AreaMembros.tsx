import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle2, AlertCircle, MessageCircle, FileText, Calendar, CreditCard } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlunoMembro {
  id: string;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  status: string;
  produto: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  dia_vencimento: number | null;
  contrato_assinado: boolean | null;
  autentique_link_assinatura: string | null;
  link_grupo_whatsapp: string | null;
  turma_nome: string | null;
}

interface Pagamento {
  id: string;
  data_vencimento: string;
  valor: number;
  status: string; // pago | atrasado | pendente | aguardando
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, mo, dy] = iso.slice(0, 10).split('-');
  return `${dy}/${mo}`;
}

function fmtDataLonga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [yr, mo, dy] = iso.slice(0, 10).split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${parseInt(dy)} ${meses[parseInt(mo) - 1]} ${yr}`;
}

function statusColor(s: string): string {
  if (s === 'pago')     return 'bg-green-100 text-green-800';
  if (s === 'atrasado') return 'bg-red-100 text-red-800';
  return 'bg-amber-100 text-amber-800';
}

function statusLabel(s: string): string {
  if (s === 'pago')      return 'Pago';
  if (s === 'atrasado')  return 'Atrasado';
  if (s === 'aguardando') return 'Aguardando';
  return 'Pendente';
}

function alunoStatusInfo(s: string): { label: string; color: string; icon: string } {
  if (s === 'ativo')        return { label: 'Matrícula ativa', color: 'text-green-700', icon: '✅' };
  if (s === 'inadimplente') return { label: 'Pagamento em aberto', color: 'text-amber-700', icon: '⚠️' };
  if (s === 'cancelado')    return { label: 'Matrícula cancelada', color: 'text-red-700', icon: '❌' };
  if (s === 'concluído' || s === 'concluido') return { label: 'Curso concluído', color: 'text-blue-700', icon: '🎓' };
  return { label: s, color: 'text-gray-600', icon: '•' };
}

// ─── Loading / Error screens ──────────────────────────────────────────────────

function ScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
      <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
    </div>
  );
}

function ScreenError({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f0f13] p-6 text-center">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <p className="text-white font-semibold text-lg">Link inválido</p>
      <p className="text-gray-400 text-sm max-w-xs">{msg}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AreaMembros() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading]   = useState(true);
  const [aluno, setAluno]       = useState<AlunoMembro | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [erro, setErro]         = useState('');

  useEffect(() => {
    if (!token) { setErro('Token não encontrado.'); setLoading(false); return; }

    const load = async () => {
      // Busca aluno pelo token + JOIN com turmas
      // Portal publico: o token e a propria credencial. A leitura passa pela RPC
      // `portal_aluno_por_token` (SECURITY DEFINER) porque a tabela `alunos` deixou
      // de ser legivel com a chave anonima — ver migration 20260821150000.
      const { data: linhas, error } = await (supabase as any)
        .rpc('portal_aluno_por_token', { p_token: token });
      const data = linhas?.[0] ?? null;

      if (error || !data) {
        setErro('Link não encontrado ou expirado. Fale com a escola para receber um novo link.');
        setLoading(false);
        return;
      }

      setAluno({
        id:                         data.id,
        nome:                       data.nome,
        email:                      data.email,
        whatsapp:                   data.whatsapp,
        status:                     data.status || 'ativo',
        produto:                    data.produto,
        data_inicio:                data.data_inicio,
        data_fim:                   data.data_fim,
        dia_vencimento:             data.dia_vencimento,
        contrato_assinado:          (data as any).contrato_assinado,
        autentique_link_assinatura: (data as any).autentique_link_assinatura,
        link_grupo_whatsapp:        (data as any).link_grupo_whatsapp,
        turma_nome:                 (data as any).turma_nome || null,
      });

      // Últimos 6 pagamentos, tambem pelo token. Antes isto lia `pagamentos`
      // direto com a chave anonima e voltava sempre vazio (nunca houve policy
      // anon nessa tabela) — a RPC corrige o bug alem de fechar o acesso.
      const { data: pags } = await (supabase as any)
        .rpc('portal_pagamentos_por_token', { p_token: token });

      if (pags) setPagamentos(pags as Pagamento[]);
      setLoading(false);
    };

    load();
  }, [token]);

  if (loading) return <ScreenLoading />;
  if (erro || !aluno) return <ScreenError msg={erro || 'Aluno não encontrado.'} />;

  const statusInfo = alunoStatusInfo(aluno.status);
  const proximoPag = pagamentos.find(p => p.status !== 'pago');

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">
      {/* Header */}
      <div className="bg-[#1a1a22] border-b border-[#2a2a36] px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
          {aluno.nome.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-white truncate">{aluno.nome}</p>
          <p className="text-xs text-gray-400 truncate">{aluno.produto || 'Área de Membros'}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Status Card */}
        <div className="rounded-2xl bg-[#1a1a22] border border-[#2a2a36] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{statusInfo.icon}</span>
            <div>
              <p className={`font-semibold text-sm ${statusInfo.color}`}>{statusInfo.label}</p>
              {aluno.turma_nome && (
                <p className="text-xs text-gray-400">{aluno.turma_nome}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            {aluno.data_inicio && (
              <div className="rounded-xl bg-[#0f0f13] border border-[#2a2a36] p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Início</p>
                <p className="text-sm font-semibold text-white">{fmtDataLonga(aluno.data_inicio)}</p>
              </div>
            )}
            {aluno.data_fim && (
              <div className="rounded-xl bg-[#0f0f13] border border-[#2a2a36] p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Conclusão</p>
                <p className="text-sm font-semibold text-white">{fmtDataLonga(aluno.data_fim)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Próximo Pagamento */}
        {proximoPag && (
          <div className="rounded-2xl bg-[#1a1a22] border border-[#2a2a36] p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-purple-400" />
              <p className="text-sm font-semibold text-white">Próximo vencimento</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-white">
                  {proximoPag.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <p className="text-xs text-gray-400">Vence em {fmtData(proximoPag.data_vencimento)}</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(proximoPag.status)}`}>
                {statusLabel(proximoPag.status)}
              </span>
            </div>
          </div>
        )}

        {/* Histórico de Pagamentos */}
        {pagamentos.length > 0 && (
          <div className="rounded-2xl bg-[#1a1a22] border border-[#2a2a36] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-400" />
              <p className="text-sm font-semibold text-white">Histórico de pagamentos</p>
            </div>
            <div className="space-y-2">
              {pagamentos.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#2a2a36] last:border-0">
                  <div>
                    <p className="text-sm text-white font-medium">
                      {p.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <p className="text-xs text-gray-500">{fmtDataLonga(p.data_vencimento)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Links de Acesso */}
        <div className="space-y-3">
          {aluno.link_grupo_whatsapp && (
            <a
              href={aluno.link_grupo_whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full rounded-2xl bg-[#1a1a22] border border-[#2a2a36] p-4 hover:border-green-500/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="h-5 w-5 text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Entrar no grupo</p>
                <p className="text-xs text-gray-400">WhatsApp da turma</p>
              </div>
              <span className="text-gray-500 group-hover:text-green-400 text-lg">›</span>
            </a>
          )}

          {aluno.autentique_link_assinatura && !aluno.contrato_assinado && (
            <a
              href={aluno.autentique_link_assinatura}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full rounded-2xl bg-[#1a1a22] border border-amber-500/30 p-4 hover:border-amber-400/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Assinar contrato</p>
                <p className="text-xs text-amber-400">Pendente de assinatura</p>
              </div>
              <span className="text-amber-400/60 group-hover:text-amber-400 text-lg">›</span>
            </a>
          )}

          {aluno.contrato_assinado && (
            <div className="flex items-center gap-3 w-full rounded-2xl bg-[#1a1a22] border border-[#2a2a36] p-4">
              <div className="w-10 h-10 rounded-xl bg-green-600/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Contrato assinado</p>
                <p className="text-xs text-gray-400">Documento em vigor</p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <p className="text-center text-xs text-gray-600 pt-4 pb-6">
          Dúvidas? Fale com a escola pelo WhatsApp.
        </p>
      </div>
    </div>
  );
}
