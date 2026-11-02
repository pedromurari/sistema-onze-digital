import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Megaphone, Plus, Send, Eye, RefreshCw, Users, Mail, MessageSquare } from 'lucide-react';

type Fonte = 'lancamento_turma' | 'leads_produto' | 'base_completa' | 'alunos';
type Canal = 'whatsapp' | 'email' | 'ambos';
type Status = 'rascunho' | 'pronta' | 'enviando' | 'concluida' | 'pausada';

interface Campanha {
  id: string;
  nome: string;
  status: Status;
  canal: Canal;
  fonte: Fonte;
  fonte_filtro: Record<string, unknown>;
  texto_whatsapp: string | null;
  link_cta: string | null;
  email_assunto: string | null;
  email_corpo: string | null;
  total_destinatarios: number;
  total_enviados_email: number;
  total_erro_email: number;
  disparo_campanha_id: string | null;
  criado_em: string;
}

interface Lancamento { id: string; nome: string; data_live: string | null; }

const STATUS_CFG: Record<Status, { label: string; cls: string }> = {
  rascunho:  { label: 'Rascunho',  cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  pronta:    { label: 'Pronta',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  enviando:  { label: 'Enviando',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  concluida: { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pausada:   { label: 'Pausada',   cls: 'bg-red-50 text-red-700 border-red-200' },
};

const TEMPLATES = [
  {
    nome: 'Reengajamento — Semana do Despertar',
    canal: 'whatsapp' as Canal,
    fonte: 'lancamento_turma' as Fonte,
    texto_whatsapp: 'Oi, {{nome}}! Tudo bem?\n\nVocê participou de uma das nossas turmas da Semana do Despertar e eu queria te contar: tem gente nova chegando toda semana, e eu lembrei de você. 💛\n\nTá rolando um conteúdo novo que acho que você vai gostar — dá uma olhada:',
    link_cta: '',
  },
  {
    nome: 'Black Friday — Formação em Psicanálise',
    canal: 'ambos' as Canal,
    fonte: 'lancamento_turma' as Fonte,
    texto_whatsapp: 'Oi, {{nome}}! 🖤\n\nA Black Friday do IDM chegou — e essa é a única vez no ano que eu consigo falar isso: abrimos a Turma #029 da Formação em Psicanálise Clínica Integrativa com a condição mais agressiva que a gente já fez. Nunca repetimos isso antes, e não sei se vamos repetir de novo.\n\nComo você já esteve com a gente na Semana do Despertar, quero te garantir uma vaga antes de abrir pro público geral.\n\nVagas limitadas e condição só até o fim da semana. Clica aqui e garante a sua:',
    link_cta: '',
    email_assunto: 'Black Friday IDM: a condição mais agressiva que já fizemos (vagas limitadas)',
    email_corpo: '<p>Oi, {{nome}}!</p><p>A Black Friday do IDM chegou — e essa é a única vez no ano que eu consigo falar isso: abrimos a Turma #029 da Formação em Psicanálise Clínica Integrativa com a condição mais agressiva que a gente já fez. Nunca repetimos isso antes, e não sei se vamos repetir de novo.</p><p>Como você já esteve com a gente na Semana do Despertar, quero te garantir uma vaga antes de abrir pro público geral.</p><p><strong>Vagas limitadas e condição só até o fim da semana.</strong></p><p>Clica aqui e garante a sua:</p>',
  },
  {
    nome: 'Matrículas abertas — Turma #029',
    canal: 'ambos' as Canal,
    fonte: 'lancamento_turma' as Fonte,
    texto_whatsapp: 'Oi, {{nome}}! 👋\n\nAs matrículas da Turma #029 da Formação em Psicanálise Clínica Integrativa do IDM acabaram de abrir — e eu lembrei de você.\n\nSe você já pensou em se formar em psicanálise clínica integrativa, essa é a hora: turma nova, vagas limitadas, início em breve.\n\nQuer saber as condições e garantir sua vaga? Clica aqui:',
    link_cta: '',
    email_assunto: 'Matrículas abertas — Turma #029 da Formação em Psicanálise IDM',
    email_corpo: '<p>Oi, {{nome}}!</p><p>As matrículas da Turma #029 da Formação em Psicanálise Clínica Integrativa do IDM acabaram de abrir — e eu lembrei de você.</p><p>Se você já pensou em se formar em psicanálise clínica integrativa, essa é a hora: turma nova, vagas limitadas, início em breve.</p><p>Quer saber as condições e garantir sua vaga? Clica aqui:</p>',
  },
  {
    nome: 'Novo conteúdo — alunos (YouTube/Instagram)',
    canal: 'whatsapp' as Canal,
    fonte: 'alunos' as Fonte,
    texto_whatsapp: 'Oi, {{nome}}! 👋\n\nSaiu conteúdo novo e lembrei de você — dá uma olhada quando puder:',
    link_cta: '',
  },
  {
    nome: 'Divã IDM — pesquisa com alunos',
    canal: 'whatsapp' as Canal,
    fonte: 'alunos' as Fonte,
    texto_whatsapp: 'Oi, {{nome}}! Tudo bem?\n\nUma pergunta rápida: você já pensou em fazer terapia, ou já está fazendo? A gente tem o Divã IDM, nosso programa de terapia social com terapeutas credenciados, sessões a partir de R$80.\n\nSe tiver interesse, é só se cadastrar aqui que nosso time já entra em contato:',
    link_cta: 'https://sistema.idmpsi.com.br/diva',
  },
];

export function DisparosMassa() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<{ campanhaId: string; total: number; comTelefone: number; comEmail: number } | null>(null);
  const [calculandoPrevia, setCalculandoPrevia] = useState<string | null>(null);
  const [disparando, setDisparando] = useState<string | null>(null);

  // Form state
  const [nome, setNome] = useState('');
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [fonte, setFonte] = useState<Fonte>('lancamento_turma');
  const [lancamentoIds, setLancamentoIds] = useState<string[]>([]);
  const [excluirMatriculados, setExcluirMatriculados] = useState(true);
  const [produto, setProduto] = useState('');
  const [alunoStatus, setAlunoStatus] = useState('ativo');
  const [excluirDiva, setExcluirDiva] = useState(false);
  const [textoWhatsapp, setTextoWhatsapp] = useState('');
  const [linkCta, setLinkCta] = useState('');
  const [emailAssunto, setEmailAssunto] = useState('');
  const [emailCorpo, setEmailCorpo] = useState('');

  const carregar = async () => {
    setCarregando(true);
    const [campRes, lancRes] = await Promise.all([
      supabase.from('campanhas_massa').select('*').order('criado_em', { ascending: false }),
      supabase.from('lancamentos').select('id, nome, data_live').order('data_live', { ascending: false }).limit(60),
    ]);
    setCampanhas((campRes.data as Campanha[]) ?? []);
    setLancamentos((lancRes.data as Lancamento[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const aplicarTemplate = (t: typeof TEMPLATES[number]) => {
    setNome(t.nome);
    setCanal(t.canal);
    setFonte(t.fonte);
    setTextoWhatsapp(t.texto_whatsapp);
    setLinkCta(t.link_cta ?? '');
    setEmailAssunto('email_assunto' in t ? (t as { email_assunto?: string }).email_assunto ?? '' : '');
    setEmailCorpo('email_corpo' in t ? (t as { email_corpo?: string }).email_corpo ?? '' : '');
    setMostrarForm(true);
  };

  const montarFonteFiltro = (): Record<string, unknown> => {
    if (fonte === 'lancamento_turma') return { lancamento_ids: lancamentoIds, excluir_matriculados: excluirMatriculados };
    if (fonte === 'leads_produto') return { produto: produto || undefined };
    if (fonte === 'alunos') return { status: [alunoStatus], excluir_diva_leads: excluirDiva };
    return {};
  };

  const salvarCampanha = async (): Promise<string | null> => {
    if (!nome.trim()) { toast.error('Dá um nome pra campanha.'); return null; }
    if (fonte === 'lancamento_turma' && !lancamentoIds.length) { toast.error('Escolhe pelo menos uma turma.'); return null; }
    setSalvando(true);
    const { data, error } = await supabase.from('campanhas_massa').insert({
      nome: nome.trim(),
      canal,
      fonte,
      fonte_filtro: montarFonteFiltro(),
      texto_whatsapp: textoWhatsapp || null,
      link_cta: linkCta || null,
      email_assunto: emailAssunto || null,
      email_corpo: emailCorpo || null,
      status: 'pronta',
    }).select('id').single();
    setSalvando(false);
    if (error || !data) { toast.error(error?.message ?? 'Falha ao salvar'); return null; }
    await carregar();
    return data.id;
  };

  const verPrevia = async () => {
    const id = await salvarCampanha();
    if (!id) return;
    setCalculandoPrevia(id);
    const { data, error } = await supabase.functions.invoke('campanha-massa-disparar', { body: { campanhaId: id, apenasContar: true } });
    setCalculandoPrevia(null);
    if (error || !data?.ok) { toast.error(data?.erro ?? error?.message ?? 'Falha ao calcular público'); return; }
    setPrevia({ campanhaId: id, total: data.total, comTelefone: data.comTelefone, comEmail: data.comEmail });
  };

  const dispararAgora = async (campanhaId: string) => {
    if (!window.confirm('Confirma o disparo? Isso vai começar a enviar de verdade pro público calculado.')) return;
    setDisparando(campanhaId);
    const { data, error } = await supabase.functions.invoke('campanha-massa-disparar', { body: { campanhaId } });
    setDisparando(null);
    if (error || !data?.ok) { toast.error(data?.erro ?? error?.message ?? 'Falha ao disparar'); return; }
    toast.success(`Disparo iniciado para ${data.totalDestinatarios} pessoas.`);
    setPrevia(null);
    setMostrarForm(false);
    resetForm();
    await carregar();
  };

  const resetForm = () => {
    setNome(''); setCanal('whatsapp'); setFonte('lancamento_turma'); setLancamentoIds([]);
    setExcluirMatriculados(true); setProduto(''); setAlunoStatus('ativo'); setExcluirDiva(false);
    setTextoWhatsapp(''); setLinkCta(''); setEmailAssunto(''); setEmailCorpo('');
  };

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Megaphone className="h-5 w-5" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Disparos em Massa</h1>
              <p className="text-sm text-muted-foreground">Campanhas de WhatsApp e e-mail pra base inteira — vendas, reengajamento e engajamento de alunos.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setMostrarForm((v) => !v); }}>
              <Plus className="h-3.5 w-3.5" /> Nova campanha
            </Button>
          </div>
        </header>

        {!mostrarForm && (
          <Card className="border-dashed">
            <CardContent className="p-4 sm:p-5 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Começar de um template</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEMPLATES.map((t) => (
                  <button key={t.nome} onClick={() => aplicarTemplate(t)} className="text-left rounded-lg border border-border/60 p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                    <p className="text-sm font-semibold text-foreground">{t.nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.canal === 'ambos' ? 'WhatsApp + E-mail' : t.canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'} · {t.fonte === 'alunos' ? 'Alunos' : t.fonte === 'lancamento_turma' ? 'Turmas (Semana do Despertar)' : 'Leads'}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {mostrarForm && (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <p className="text-sm font-bold text-foreground">Nova campanha</p>

              <Input placeholder="Nome da campanha (uso interno)" value={nome} onChange={(e) => setNome(e.target.value)} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Canal</label>
                  <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="ambos">WhatsApp + E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Público</label>
                  <Select value={fonte} onValueChange={(v) => setFonte(v as Fonte)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lancamento_turma">Turmas da Semana do Despertar</SelectItem>
                      <SelectItem value="leads_produto">Leads por produto/canal</SelectItem>
                      <SelectItem value="alunos">Alunos (engajamento)</SelectItem>
                      <SelectItem value="base_completa">Base completa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {fonte === 'lancamento_turma' && (
                <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Turmas (marque uma ou mais)</p>
                  <div className="max-h-40 overflow-y-auto grid gap-1 sm:grid-cols-2">
                    {lancamentos.map((l) => (
                      <label key={l.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={lancamentoIds.includes(l.id)} onChange={(e) => setLancamentoIds((prev) => e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id))} />
                        {l.nome}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={excluirMatriculados} onChange={(e) => setExcluirMatriculados(e.target.checked)} />
                    Excluir quem já se matriculou
                  </label>
                </div>
              )}

              {fonte === 'leads_produto' && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <Select value={produto} onValueChange={setProduto}>
                    <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_comercial">Time Comercial</SelectItem>
                      <SelectItem value="lancamento">Lançamento</SelectItem>
                      <SelectItem value="direto">Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {fonte === 'alunos' && (
                <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                  <Select value={alunoStatus} onValueChange={setAlunoStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Alunos ativos</SelectItem>
                      <SelectItem value="cancelado">Alunos cancelados</SelectItem>
                      <SelectItem value="concluido">Alunos concluídos</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={excluirDiva} onChange={(e) => setExcluirDiva(e.target.checked)} />
                    Excluir quem já demonstrou interesse no Divã IDM
                  </label>
                </div>
              )}

              {(canal === 'whatsapp' || canal === 'ambos') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Texto do WhatsApp (use {'{{nome}}'})</label>
                  <Textarea rows={5} value={textoWhatsapp} onChange={(e) => setTextoWhatsapp(e.target.value)} placeholder="Oi, {{nome}}! ..." />
                </div>
              )}

              <Input placeholder="Link do CTA (vídeo, post, oferta, /diva...)" value={linkCta} onChange={(e) => setLinkCta(e.target.value)} />

              {(canal === 'email' || canal === 'ambos') && (
                <div className="space-y-2">
                  <Input placeholder="Assunto do e-mail" value={emailAssunto} onChange={(e) => setEmailAssunto(e.target.value)} />
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Corpo do e-mail (HTML simples)</label>
                  <Textarea rows={5} value={emailCorpo} onChange={(e) => setEmailCorpo(e.target.value)} placeholder="<p>Oi, {{nome}}! ...</p>" />
                </div>
              )}

              {previa && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span><strong>{previa.total}</strong> destinatários únicos — {previa.comTelefone} com WhatsApp, {previa.comEmail} com e-mail.</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => void verPrevia()} disabled={!!calculandoPrevia}>
                  <Eye className="h-3.5 w-3.5" /> {calculandoPrevia ? 'Calculando...' : 'Pré-visualizar público'}
                </Button>
                {previa && (
                  <Button size="sm" onClick={() => void dispararAgora(previa.campanhaId)} disabled={!!disparando}>
                    <Send className="h-3.5 w-3.5" /> {disparando ? 'Disparando...' : `Disparar pra ${previa.total} pessoas`}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setMostrarForm(false); setPrevia(null); resetForm(); }}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <p className="text-sm font-bold text-foreground">Campanhas ({carregando ? '—' : campanhas.length})</p>
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : campanhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma campanha ainda. Cria a primeira acima.</p>
            ) : (
              <div className="space-y-2">
                {campanhas.map((c) => {
                  const cfg = STATUS_CFG[c.status];
                  return (
                    <div key={c.id} className="rounded-lg border border-border/60 p-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.canal === 'ambos' ? 'WhatsApp + E-mail' : c.canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'} ·{' '}
                          {c.total_destinatarios || 0} destinatários
                          {c.canal !== 'whatsapp' && ` · ${c.total_enviados_email} e-mails enviados`}
                        </p>
                      </div>
                      <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
