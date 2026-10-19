import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoIdm from '@/assets/logo-idm.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AulaPublica = {
  turma: string;
  professor: string | null;
  data: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  modulo: string | null;
  status: string;
  janela_aberta: boolean;
};

async function chamar(acao: string, aulaId: string, campos: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('presenca-publica', {
    body: { acao, aula_id: aulaId, ...campos },
  });
  if (error) {
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.erro || 'Não foi possível acessar a presença.');
    }
    throw new Error('Não foi possível acessar a presença. Tente novamente.');
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

export default function PresencaPublica() {
  const { aulaId = '' } = useParams();
  const [params] = useSearchParams();
  const professor = params.get('perfil') === 'professor';
  const chave = params.get('chave') || '';
  const [aula, setAula] = useState<AulaPublica | null>(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [confirmou, setConfirmou] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    void chamar('info', aulaId).then((data: AulaPublica) => {
      if (ativo) { setAula(data); setErro(''); }
    }).catch((error: Error) => { if (ativo) setErro(error.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [aulaId]);

  async function assinar(event: FormEvent) {
    event.preventDefault();
    if (!aula?.janela_aberta || enviando) return;
    setErro(''); setEnviando(true);
    try {
      if (professor) await chamar('assinar_professor', aulaId, { chave });
      else await chamar('assinar_aluno', aulaId, { nome: nome.trim(), cpf, data_nascimento: nascimento });
      setEnviado(true);
    } catch (error) { setErro(error instanceof Error ? error.message : 'Não foi possível confirmar a presença.'); }
    finally { setEnviando(false); }
  }

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-950 p-2 shadow-sm">
          <img src={logoIdm} alt="Logo do Instituto Despertamente" className="h-full w-full object-contain" />
        </div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instituto Despertamente</p>
          <h1 className="text-2xl font-bold">Lista de presença</h1></div>
      </header>
      {carregando && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando aula...</p>}
      {erro && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
      {aula && <Card><CardHeader>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{professor ? 'Confirmação do professor' : 'Confirmação do aluno'}</p>
        <CardTitle>{aula.modulo || 'Aula'} · {aula.turma}</CardTitle>
        <p className="text-sm text-muted-foreground">{new Date(`${aula.data}T12:00:00`).toLocaleDateString('pt-BR')} · {aula.horario_inicio?.slice(0, 5) || 'Horário não informado'}{aula.horario_fim ? `–${aula.horario_fim.slice(0, 5)}` : ''}</p>
        {aula.professor && <p className="text-sm text-muted-foreground">Professor(a): {aula.professor}</p>}
      </CardHeader><CardContent className="space-y-4">
        {enviado ? <div role="status" className="space-y-2 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="text-lg font-semibold">Presença confirmada</h2>
          <p className="text-sm text-muted-foreground">Sua assinatura foi registrada nesta aula. Não é necessário enviar novamente.</p>
        </div> : !aula.janela_aberta ? <p className="rounded-lg bg-muted p-3 text-sm">O formulário abre no dia da aula e permanece disponível até o dia seguinte. Aulas canceladas ou adiadas não recebem presença.</p> : professor ? <form onSubmit={(event) => void assinar(event)} className="space-y-4">
          <p className="text-sm">Este link é individual e deve ser compartilhado apenas com o professor da aula.</p>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmou} onCheckedChange={(value) => setConfirmou(value === true)} /> Confirmo que ministrei esta aula.</label>
          <Button type="submit" disabled={!confirmou || !chave || enviando}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Assinar minha presença</Button>
        </form> : <form onSubmit={(event) => void assinar(event)} className="space-y-4">
          <p className="flex gap-2 rounded-lg bg-muted/40 p-3 text-sm"><LockKeyhole className="h-4 w-4 shrink-0" /> Informe os dados do seu cadastro. O sistema confere sua matrícula nesta turma antes de registrar a presença.</p>
          <div className="space-y-1.5"><Label htmlFor="presenca-nome">Nome completo</Label><Input id="presenca-nome" value={nome} onChange={event => setNome(event.target.value)} minLength={3} maxLength={160} autoComplete="name" required /></div>
          <div className="space-y-1.5"><Label htmlFor="presenca-cpf">CPF</Label><Input id="presenca-cpf" value={cpf} onChange={event => setCpf(event.target.value)} inputMode="numeric" maxLength={14} autoComplete="off" required /></div>
          <div className="space-y-1.5"><Label htmlFor="presenca-nascimento">Data de nascimento</Label><Input id="presenca-nascimento" type="date" value={nascimento} onChange={event => setNascimento(event.target.value)} required /></div>
          <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar presença</Button>
        </form>}
      </CardContent></Card>}
      <p className="text-center text-xs text-muted-foreground">Problema com seu cadastro? Fale com a secretaria: <a href="https://wa.me/5511930439385" className="underline">+55 11 93043-9385</a>.</p>
    </div>
  </main>;
}
