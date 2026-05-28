/**
 * ContratoPublico.tsx
 * Página pública (sem login) acessada pelo aluno via link único.
 * URL: /assinar/:token
 * Exibe dados pré-preenchidos → coleta dados legais → chama autentique-criar.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, FileText, User, Phone, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlunoPublico {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  cep: string | null;
  cidade_estado: string | null;
  forms_respondido: boolean | null;
  contrato_enviado: boolean | null;
  autentique_link_assinatura: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContratoPublico() {
  const { token } = useParams<{ token: string }>();

  const [aluno, setAluno]       = useState<AlunoPublico | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [contratoLink, setContratoLink] = useState('');

  const [form, setForm] = useState({
    cpf: '',
    data_nascimento: '',
    endereco: '',
    cep: '',
    cidade_estado: '',
  });

  // ── Load aluno by token ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setLoading(false); setNotFound(true); return; }
    (async () => {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome, whatsapp, email, cpf, data_nascimento, endereco, cep, cidade_estado, forms_respondido, contrato_enviado, autentique_link_assinatura')
        .eq('contrato_token', token)
        .maybeSingle();

      if (error || !data) { setLoading(false); setNotFound(true); return; }

      setAluno(data as AlunoPublico);
      // Pré-preenche com dados já salvos (caso aluno volte)
      setForm({
        cpf:            data.cpf            ?? '',
        data_nascimento: data.data_nascimento ?? '',
        endereco:       data.endereco       ?? '',
        cep:            data.cep            ?? '',
        cidade_estado:  data.cidade_estado  ?? '',
      });

      // Já enviado — mostra o link diretamente
      if (data.autentique_link_assinatura) {
        setContratoLink(data.autentique_link_assinatura);
        setDone(true);
      }

      setLoading(false);
    })();
  }, [token]);

  // ── Format CPF ─────────────────────────────────────────────────────────────
  const formatCPF = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  // ── Format CEP ─────────────────────────────────────────────────────────────
  const formatCEP = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, '$1-$2');
  };

  // ── Submit → autentique-criar ──────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!aluno) return;

    // Validações
    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) { toast.error('CPF inválido. Preencha 11 dígitos.'); return; }
    if (!form.data_nascimento)   { toast.error('Informe sua data de nascimento.'); return; }
    if (!form.endereco.trim())   { toast.error('Informe seu endereço.'); return; }
    if (!form.cidade_estado.trim()) { toast.error('Informe cidade e estado.'); return; }

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
      toast.success('Dados enviados! Você receberá o contrato em breve.');
    } catch (err: any) {
      toast.error('Erro ao enviar dados: ' + (err?.message ?? 'Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !aluno) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="text-6xl">🔍</div>
          <h2 className="text-xl font-semibold text-foreground">Link não encontrado</h2>
          <p className="text-sm text-muted-foreground">
            Este link é inválido ou já expirou. Entre em contato com nossa equipe.
          </p>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Dados recebidos!</h2>
            <p className="text-sm text-muted-foreground">
              Seu contrato está sendo gerado. Você receberá o link de assinatura via WhatsApp em instantes.
            </p>
          </div>
          {contratoLink && (
            <a
              href={contratoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button className="w-full bg-primary hover:bg-primary/90">
                <FileText className="h-4 w-4 mr-2" /> Assinar Contrato
              </Button>
            </a>
          )}
        </Card>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-2">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Formulário de Contrato</h1>
          <p className="text-sm text-muted-foreground">
            Preencha seus dados para gerarmos seu contrato de matrícula.
          </p>
        </div>

        {/* Card: dados já preenchidos (leitura) */}
        <Card className="p-5 border border-border space-y-3">
          <h3 className="text-sm font-semibold text-foreground mb-1">Seus dados cadastrais</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium">{aluno.nome}</span>
            </div>
            {aluno.whatsapp && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">{aluno.whatsapp}</span>
              </div>
            )}
            {aluno.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">{aluno.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60 pt-1">
              <Lock className="h-3 w-3" />
              <span>Dados protegidos — somente sua equipe tem acesso.</span>
            </div>
          </div>
        </Card>

        {/* Card: dados legais (editáveis) */}
        <Card className="p-5 border border-border space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Dados complementares</h3>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/80">CPF *</label>
            <Input
              placeholder="000.000.000-00"
              value={form.cpf}
              onChange={e => setForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
              className="h-10"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/80">Data de nascimento *</label>
            <Input
              type="date"
              value={form.data_nascimento}
              onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
              className="h-10"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground/80">Endereço completo *</label>
            <Input
              placeholder="Rua, número, bairro"
              value={form.endereco}
              onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">CEP</label>
              <Input
                placeholder="00000-000"
                value={form.cep}
                onChange={e => setForm(f => ({ ...f, cep: formatCEP(e.target.value) }))}
                className="h-10"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/80">Cidade / Estado *</label>
              <Input
                placeholder="São Paulo / SP"
                value={form.cidade_estado}
                onChange={e => setForm(f => ({ ...f, cidade_estado: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>
        </Card>

        {/* Submit */}
        <Button
          className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold text-base"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Enviando dados...</>
            : 'Confirmar dados e gerar contrato →'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Após confirmar, você receberá o link para assinar o contrato via WhatsApp.
        </p>
      </div>
    </div>
  );
}
