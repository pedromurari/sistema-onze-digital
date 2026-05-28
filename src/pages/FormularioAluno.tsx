/**
 * FormularioAluno.tsx
 * Página pública isolada (sem login, sem chrome da app).
 * URL: /formulario/:token
 *
 * O aluno acessa este link, preenche os dados complementares e
 * ao confirmar: sistema atualiza status → 'ativo' (aparece no Financeiro)
 * e gera o contrato na Autentique, enviando o link para assinatura via WPP.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, AlertCircle, User, Phone, Mail, Shield, FileSignature } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlunoPublico {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  produto: string | null;
  status: string | null;
  autentique_link_assinatura: string | null;
  forms_respondido: boolean | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatCEP = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d)/, '$1-$2');
};

// ─── Screens ──────────────────────────────────────────────────────────────────

function ScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0f4f8' }}>
      <Loader2 className="h-10 w-10 animate-spin" style={{ color: '#6c63ff' }} />
    </div>
  );
}

function ScreenNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f4f8' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-10 text-center space-y-4">
        <AlertCircle className="h-14 w-14 mx-auto text-red-400" />
        <h2 className="text-xl font-semibold text-gray-800">Link não encontrado</h2>
        <p className="text-sm text-gray-500">
          Este link é inválido ou já foi utilizado. Entre em contato com nossa equipe.
        </p>
      </div>
    </div>
  );
}

function ScreenSuccess({ contratoLink, nomeAluno }: { contratoLink: string; nomeAluno: string }) {
  const firstName = nomeAluno.split(' ')[0];
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f0f4f8' }}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-10 text-center space-y-6">
        <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500" />
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-800">Matrícula confirmada!</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Parabéns, <strong>{firstName}</strong>! Seus dados foram recebidos e sua matrícula foi registrada com sucesso.
          </p>
        </div>
        {contratoLink ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Seu contrato está pronto. Clique abaixo para assinar:
            </p>
            <a href={contratoLink} target="_blank" rel="noopener noreferrer" className="block">
              <Button
                className="w-full h-12 text-base font-semibold rounded-xl text-white"
                style={{ background: '#6c63ff' }}
              >
                <FileSignature className="h-5 w-5 mr-2" />
                Assinar contrato
              </Button>
            </a>
            <p className="text-xs text-gray-400">
              Você também receberá este link via WhatsApp em instantes.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Você receberá o link do contrato via WhatsApp em breve.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FormularioAluno() {
  const { token } = useParams<{ token: string }>();

  const [aluno, setAluno]             = useState<AlunoPublico | null>(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [contratoLink, setContratoLink] = useState('');
  const [erro, setErro]               = useState('');

  const [form, setForm] = useState({
    cpf: '',
    data_nascimento: '',
    endereco: '',
    cep: '',
    cidade_estado: '',
  });

  // ── Carrega aluno pelo token ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return; }
    (async () => {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, whatsapp, email, produto, status, autentique_link_assinatura, forms_respondido')
        .eq('contrato_token', token)
        .maybeSingle();

      if (error || !data) { setLoading(false); setNotFound(true); return; }

      setAluno(data as AlunoPublico);

      // Já respondeu? Mostra tela de sucesso
      if (data.forms_respondido) {
        setContratoLink(data.autentique_link_assinatura ?? '');
        setDone(true);
      }

      setLoading(false);
    })();
  }, [token]);

  // ── Submissão ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!aluno) return;
    setErro('');

    // Validações
    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11)    { setErro('CPF inválido. Verifique os 11 dígitos.'); return; }
    if (!form.data_nascimento)       { setErro('Informe sua data de nascimento.'); return; }
    if (!form.endereco.trim())       { setErro('Informe seu endereço completo.'); return; }
    if (!form.cidade_estado.trim())  { setErro('Informe sua cidade e estado.'); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('autentique-criar', {
        body: {
          aluno_id:        aluno.id,
          cpf:             form.cpf,
          data_nascimento: form.data_nascimento,
          endereco:        form.endereco.trim(),
          cep:             form.cep.trim(),
          cidade_estado:   form.cidade_estado.trim(),
        },
      });

      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      setContratoLink((data as any)?.link_assinatura ?? '');
      setDone(true);
    } catch (err: any) {
      setErro('Erro ao enviar: ' + (err?.message ?? 'Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Renders ────────────────────────────────────────────────────────────────

  if (loading)   return <ScreenLoading />;
  if (notFound || !aluno)  return <ScreenNotFound />;
  if (done)      return <ScreenSuccess contratoLink={contratoLink} nomeAluno={aluno.nome} />;

  const produtoLabel = aluno.produto
    ? aluno.produto.charAt(0).toUpperCase() + aluno.produto.slice(1)
    : 'Curso';

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#f0f4f8' }}>
      <div className="max-w-xl mx-auto space-y-4">

        {/* ── Header card ── */}
        <div
          className="rounded-2xl p-8 text-white"
          style={{ background: 'linear-gradient(135deg, #6c63ff 0%, #8b5cf6 100%)', borderTop: '8px solid #4f46e5' }}
        >
          <h1 className="text-2xl font-bold mb-1">Formulário de Matrícula</h1>
          <p className="text-purple-100 text-sm">{produtoLabel} — 11 Digital Strategy</p>
          <p className="text-purple-200 text-xs mt-3">
            Preencha seus dados complementares para concluir a matrícula e receber o contrato.
          </p>
        </div>

        {/* ── Card: dados já preenchidos (read-only) ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-3">
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">Seus dados cadastrais</p>

          <div className="flex items-center gap-3 text-sm text-gray-700">
            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="font-medium">{aluno.nome}</span>
          </div>
          {aluno.whatsapp && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span>{aluno.whatsapp}</span>
            </div>
          )}
          {aluno.email && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span>{aluno.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100">
            <Shield className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Dados protegidos — apenas a equipe 11 Digital tem acesso.</span>
          </div>
        </div>

        {/* ── Card: CPF ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            CPF <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={e => setForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
            inputMode="numeric"
            className="h-11 text-base border-gray-200 focus:border-purple-400 focus:ring-purple-400/20 rounded-xl"
          />
        </div>

        {/* ── Card: Data de nascimento ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Data de nascimento <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            value={form.data_nascimento}
            onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
            className="h-11 text-base border-gray-200 focus:border-purple-400 focus:ring-purple-400/20 rounded-xl"
          />
        </div>

        {/* ── Card: Endereço ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Endereço</p>

          <div className="space-y-2">
            <label className="block text-xs text-gray-500">Rua, número, bairro <span className="text-red-500">*</span></label>
            <Input
              placeholder="Ex: Rua das Flores, 123, Jardim Europa"
              value={form.endereco}
              onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
              className="h-11 text-base border-gray-200 focus:border-purple-400 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-xs text-gray-500">CEP</label>
              <Input
                placeholder="00000-000"
                value={form.cep}
                onChange={e => setForm(f => ({ ...f, cep: formatCEP(e.target.value) }))}
                inputMode="numeric"
                className="h-11 text-base border-gray-200 focus:border-purple-400 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Cidade / Estado <span className="text-red-500">*</span></label>
              <Input
                placeholder="Ex: São Paulo / SP"
                value={form.cidade_estado}
                onChange={e => setForm(f => ({ ...f, cidade_estado: e.target.value }))}
                className="h-11 text-base border-gray-200 focus:border-purple-400 rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* ── Erro ── */}
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {erro}
          </div>
        )}

        {/* ── Submit ── */}
        <Button
          className="w-full h-14 text-base font-semibold rounded-xl text-white shadow-md"
          style={{ background: submitting ? '#9ca3af' : 'linear-gradient(135deg, #6c63ff 0%, #8b5cf6 100%)' }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Confirmando matrícula...</>
            : 'Confirmar dados e receber contrato →'}
        </Button>

        <p className="text-center text-xs text-gray-400 pb-8">
          Ao confirmar, seus dados serão salvos e você receberá o link para assinar o contrato via WhatsApp.
        </p>

      </div>
    </div>
  );
}
