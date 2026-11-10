import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, LockKeyhole, MessageSquarePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoIdm from '@/assets/logo-idm.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Questao = {
  id: string;
  ordem: number;
  tipo: 'objetiva' | 'discursiva' | 'trabalho';
  enunciado: string;
  opcoes: string[] | null;
  resposta_correta: string | null;
  resposta_esperada: string | null;
  criterios_correcao: string | null;
  pontos: number;
};

type Info = {
  titulo: string; tipo: string; modulo: string | null; instrucoes: string | null;
  status: string; questoes: Questao[];
};

async function chamar(acao: string, avaliacaoId: string, campos: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('avaliacao-revisao-publica', {
    body: { acao, avaliacao_id: avaliacaoId, ...campos },
  });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.erro || 'Não foi possível acessar a revisão.');
    }
    throw new Error('Não foi possível acessar a revisão. Tente novamente.');
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

function nomeCompletoValido(nome: string) {
  return nome.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function CaixaComentario({ avaliacaoId, questaoId, autorNome }: { avaliacaoId: string; questaoId: string | null; autorNome: string }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (enviando || !texto.trim()) return;
    setErro(''); setEnviando(true);
    try {
      await chamar('comentar', avaliacaoId, { questao_id: questaoId, autor_nome: autorNome, comentario: texto.trim() });
      setEnviado(true); setTexto('');
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível enviar.'); }
    finally { setEnviando(false); }
  }

  if (enviado) return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Comentário enviado — {autorNome.split(' ')[0]}, obrigado! Pode mandar outro se lembrar de mais alguma coisa.
    </div>
  );

  return (
    <form onSubmit={(event) => void enviar(event)} className="mt-3 space-y-2">
      <Textarea value={texto} onChange={event => setTexto(event.target.value)} placeholder="Comentário sobre esta questão (opcional)..." rows={2} className="text-sm" />
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={enviando || !texto.trim()}>
        {enviando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <MessageSquarePlus className="mr-2 h-3.5 w-3.5" />} Enviar comentário
      </Button>
    </form>
  );
}

export default function RevisaoAvaliacaoPublica() {
  const { avaliacaoId = '' } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [nomeDigitado, setNomeDigitado] = useState('');
  const [nomeConfirmado, setNomeConfirmado] = useState('');
  const [avisoNome, setAvisoNome] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void chamar('info', avaliacaoId).then((data: Info) => {
      if (ativo) { setInfo(data); setErro(''); }
    }).catch((error: Error) => { if (ativo) setErro(error.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [avaliacaoId]);

  const nomeArmazenado = useMemo(() => {
    try { return sessionStorage.getItem(`revisao-nome-${avaliacaoId}`) || ''; } catch { return ''; }
  }, [avaliacaoId]);

  useEffect(() => { if (nomeArmazenado) setNomeConfirmado(nomeArmazenado); }, [nomeArmazenado]);

  function confirmarNome(event: FormEvent) {
    event.preventDefault();
    if (!nomeCompletoValido(nomeDigitado)) {
      setAvisoNome('Digite seu nome completo (nome e sobrenome), não só o primeiro nome.');
      return;
    }
    const nome = nomeDigitado.trim().replace(/\s+/g, ' ');
    setAvisoNome('');
    setNomeConfirmado(nome);
    try { sessionStorage.setItem(`revisao-nome-${avaliacaoId}`, nome); } catch { /* segue sem salvar */ }
  }

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-950 p-2 shadow-sm">
          <img src={logoIdm} alt="Logo do Instituto Despertamente" className="h-full w-full object-contain" />
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instituto Despertamente</p>
          <h1 className="text-2xl font-bold">Revisão de avaliação</h1></div>
      </header>

      {carregando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
      {erro && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

      {info && !nomeConfirmado && <Card><CardHeader>
        <CardTitle className="text-lg">Antes de ver a prova</CardTitle>
        <p className="text-sm text-muted-foreground">Pra gente saber quem revisou o quê, informe seu nome completo.</p>
      </CardHeader><CardContent>
        <form onSubmit={confirmarNome} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="revisao-nome">Nome completo</Label>
            <Input id="revisao-nome" value={nomeDigitado} onChange={event => { setNomeDigitado(event.target.value); setAvisoNome(''); }} placeholder="Nome e sobrenome" autoComplete="name" required />
          </div>
          {avisoNome && <p role="alert" className="text-xs text-destructive">{avisoNome}</p>}
          <Button type="submit">Continuar</Button>
        </form>
      </CardContent></Card>}

      {info && nomeConfirmado && <Card><CardHeader>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><LockKeyhole className="h-3.5 w-3.5" /> Revisando como {nomeConfirmado}</p>
        <CardTitle>{info.titulo}</CardTitle>
        {info.modulo && <p className="text-sm text-muted-foreground">{info.modulo}</p>}
        {info.instrucoes && <p className="text-sm text-muted-foreground">{info.instrucoes}</p>}
      </CardHeader><CardContent className="space-y-5">
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">O gabarito aparece junto de cada questão só nesta tela de revisão — a ideia é confirmar se a questão e a resposta certa estão corretas, não responder como aluno.</div>

        {info.questoes.map((questao, index) => <div key={questao.id} className="space-y-2 rounded-lg border p-4">
          <p className="text-sm font-medium"><span className="text-muted-foreground">{index + 1}.</span> {questao.enunciado}</p>
          {questao.tipo === 'objetiva' && questao.opcoes && <ul className="space-y-1.5">
            {questao.opcoes.map((opcao, i) => {
              const correta = opcao === questao.resposta_correta;
              return <li key={i} className={`flex gap-2 rounded-md border px-2.5 py-1.5 text-sm ${correta ? 'border-emerald-600/40 bg-emerald-600/10' : 'border-border'}`}>
                <span className="font-semibold text-muted-foreground">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{opcao}</span>
                {correta && <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">✓ correta</span>}
              </li>;
            })}
          </ul>}
          {questao.tipo !== 'objetiva' && questao.resposta_esperada && <p className="rounded-md border border-border bg-muted/30 p-2.5 text-sm text-muted-foreground"><span className="font-medium text-foreground">Resposta esperada: </span>{questao.resposta_esperada}</p>}
          {questao.tipo !== 'objetiva' && questao.criterios_correcao && <p className="text-xs text-muted-foreground"><span className="font-medium">Critério de correção: </span>{questao.criterios_correcao}</p>}
          <CaixaComentario avaliacaoId={avaliacaoId} questaoId={questao.id} autorNome={nomeConfirmado} />
        </div>)}

        <div className="rounded-lg border border-dashed p-4">
          <p className="mb-1 text-sm font-medium">Comentário geral sobre a prova</p>
          <p className="mb-1 text-xs text-muted-foreground">Algo que não é sobre uma questão específica? Deixa aqui.</p>
          <CaixaComentario avaliacaoId={avaliacaoId} questaoId={null} autorNome={nomeConfirmado} />
        </div>
      </CardContent></Card>}
    </div>
  </main>;
}
