import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoIdm from '@/assets/logo-idm.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

type Questao = {
  id: string; ordem: number; tipo: 'objetiva' | 'discursiva' | 'envio_trabalho';
  enunciado: string; opcoes: string[] | null; pontos: number;
};

type Info = {
  aluno: string | null; titulo: string; tipo: string; modulo: string | null;
  instrucoes: string | null; ja_enviada: boolean; questoes: Questao[];
};

async function chamar(acao: string, avaliacaoId: string, token: string, campos: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('ped-avaliacao-aluno', {
    body: { acao, avaliacao_id: avaliacaoId, token, ...campos },
  });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.erro || 'Não foi possível acessar a avaliação.');
    }
    throw new Error('Não foi possível acessar a avaliação. Tente novamente.');
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export default function AvaliacaoPublica() {
  const { avaliacaoId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void chamar('info', avaliacaoId, token).then((data: Info) => {
      if (ativo) { setInfo(data); setErro(''); }
    }).catch((error: Error) => { if (ativo) setErro(error.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [avaliacaoId, token]);

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (enviando || !info) return;
    const faltando = info.questoes.filter(q => !respostas[q.id]?.trim());
    if (faltando.length > 0) { setErro(`Responda todas as questões antes de enviar (falta ${faltando.length}).`); return; }
    setErro(''); setEnviando(true);
    try {
      await chamar('responder', avaliacaoId, token, { respostas });
      setEnviada(true);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível enviar.'); }
    finally { setEnviando(false); }
  }

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-950 p-2 shadow-sm">
          <img src={logoIdm} alt="Logo do Instituto Despertamente" className="h-full w-full object-contain" />
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instituto Despertamente</p>
          <h1 className="text-2xl font-bold">Prova e trabalhos</h1></div>
      </header>

      {carregando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
      {erro && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

      {info && <Card><CardHeader>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"><LockKeyhole className="h-3.5 w-3.5" /> {info.aluno}</p>
        <CardTitle>{info.titulo}</CardTitle>
        {info.modulo && <p className="text-sm text-muted-foreground">{info.modulo}</p>}
        {info.instrucoes && <p className="text-sm text-muted-foreground">{info.instrucoes}</p>}
      </CardHeader><CardContent className="space-y-5">
        {enviada || info.ja_enviada ? <div role="status" className="space-y-2 text-center py-6">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="text-lg font-semibold">Respostas enviadas</h2>
          <p className="text-sm text-muted-foreground">Recebemos sua prova. A correção final sai depois da revisão da professora.</p>
        </div> : <form onSubmit={(event) => void enviar(event)} className="space-y-5">
          {info.questoes.map((questao, index) => <div key={questao.id} className="space-y-2 rounded-lg border p-4">
            <p className="text-sm font-medium"><span className="text-muted-foreground">{index + 1}.</span> {questao.enunciado}</p>
            {questao.tipo === 'objetiva' && questao.opcoes && <RadioGroup value={respostas[questao.id] || ''} onValueChange={value => setRespostas(prev => ({ ...prev, [questao.id]: value }))} className="space-y-1.5">
              {questao.opcoes.map((opcao, i) => <label key={i} className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value={opcao} id={`${questao.id}-${i}`} className="mt-0.5" />
                <span><span className="font-semibold text-muted-foreground">{String.fromCharCode(65 + i)}</span> {opcao}</span>
              </label>)}
            </RadioGroup>}
            {questao.tipo !== 'objetiva' && <Textarea value={respostas[questao.id] || ''} onChange={event => setRespostas(prev => ({ ...prev, [questao.id]: event.target.value }))} rows={6} placeholder="Escreva sua resposta..." />}
          </div>)}
          <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar respostas</Button>
        </form>}
      </CardContent></Card>}
      <p className="text-center text-xs text-muted-foreground">Problema com o link? Fale com a secretaria: <a href="https://wa.me/5511930439385" className="underline">+55 11 93043-9385</a>.</p>
    </div>
  </main>;
}
