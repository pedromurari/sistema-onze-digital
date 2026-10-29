import { useCallback, useEffect, useState } from 'react';
import { Cake, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/db/fetchAll';
import { aniversariantesDoMes, type AlunoAniversario } from '@/lib/marketing/aniversarios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function mesBrasil() {
  const mes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', month: '2-digit' }).formatToParts(new Date()).find(p => p.type === 'month')?.value;
  return Number(mes ?? 1);
}

export function Aniversariantes() {
  const [mes, setMes] = useState(mesBrasil);
  const [alunos, setAlunos] = useState<AlunoAniversario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const resultado = await fetchAll<AlunoAniversario>((de, ate) =>
        supabase.from('alunos').select('id, nome, data_nascimento, turma_id')
          .not('data_nascimento', 'is', null).order('id').range(de, ate),
      );
      setAlunos(resultado);
    } catch {
      setAlunos([]);
      setErro('Não foi possível carregar os aniversariantes. Confira o acesso aos alunos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const aniversariantes = aniversariantesDoMes(alunos, mes);
  const tituloMes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(2024, mes - 1, 1));

  return <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-4xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1.5"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Cake className="h-5 w-5" /></div><h1 className="text-2xl font-bold">Aniversariantes</h1></div><p className="text-sm text-muted-foreground">Alunos cadastrados com aniversário no mês — referência interna para pautas de conteúdo. Não publica nem envia mensagem automaticamente.</p></div>
      <Button variant="outline" onClick={() => void carregar()} disabled={carregando}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </header>
    <div className="max-w-48 space-y-1"><Label htmlFor="marketing-mes-aniversario">Mês</Label><Input id="marketing-mes-aniversario" type="number" min={1} max={12} value={mes} onChange={event => { const valor = Number(event.target.value); if (valor >= 1 && valor <= 12) setMes(valor); }} /></div>
    <Card className="border-border/70 shadow-sm"><CardContent className="space-y-3 p-4 sm:p-5">
      <h2 className="font-semibold capitalize">{tituloMes} · {carregando ? '…' : aniversariantes.length} aluno(s)</h2>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {carregando ? <p className="text-sm text-muted-foreground">Carregando...</p> : aniversariantes.length === 0 && !erro ? <p className="text-sm text-muted-foreground">Nenhum aluno com aniversário cadastrado neste mês.</p> : null}
      {!carregando && aniversariantes.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="p-2">Dia</th><th className="p-2">Aluno</th></tr></thead><tbody>{aniversariantes.map(aluno => <tr key={aluno.id} className="border-b last:border-0"><td className="p-2 tabular-nums">{aluno.data_nascimento?.slice(8, 10)}/{aluno.data_nascimento?.slice(5, 7)}</td><td className="p-2 font-medium">{aluno.nome}</td></tr>)}</tbody></table></div>}
      <p className="text-xs text-muted-foreground">Uso interno. Antes de publicar nome ou imagem de um aluno, confirme a autorização de uso de imagem e dados.</p>
    </CardContent></Card>
  </div></div>;
}
