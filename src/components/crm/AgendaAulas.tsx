import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

interface Aula {
  id: string;
  turma_id: string;
  profissional_id: string | null;
  data: string;
  horario_inicio: string | null;
  horario_fim: string | null;
  modulo: string | null;
  status: string;
  link_meet: string | null;
  turma: { nome: string } | null;
  professor: { nome: string } | null;
}

function meetUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function mesAtual() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
}

export function AgendaAulas() {
  const { user } = useAuth();
  const allowed = user?.tipo === 'admin' || user?.permissionMatrix?.rh?.ver === true;
  const [month, setMonth] = useState(mesAtual);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const nextMonth = validMonth ? `${Number(month.slice(0, 4)) + (month.endsWith('-12') ? 1 : 0)}-${String(Number(month.slice(5)) % 12 + 1).padStart(2, '0')}-01` : '';
  const query = useQuery({
    queryKey: ['agenda-aulas', user?.id, month, page],
    enabled: Boolean(allowed && validMonth),
    queryFn: async ({ signal }) => {
      // Mesma tabela usada pela Lista de Presença; não duplicar os registros.
      const { data, error } = await supabase.from('aulas')
        .select('id,turma_id,profissional_id,data,horario_inicio,horario_fim,modulo,status,link_meet,turma:turmas(nome),professor:profissionais(nome)')
        .gte('data', `${month}-01`).lt('data', nextMonth)
        .order('data').order('horario_inicio').order('id')
        .range(page * 50, page * 50 + 50).abortSignal(signal).returns<Aula[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => { setSelectedId(null); }, [month, page]);
  const aulas = (query.data ?? []).slice(0, 50);
  const selected = aulas.find(aula => aula.id === selectedId);
  const link = meetUrl(selected?.link_meet ?? null);

  if (!allowed) return <div className="p-6">Acesso restrito à equipe com permissão de RH.</div>;

  return <div className="p-4 md:p-6 space-y-5">
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays />Agenda de aulas</h1>
      <p className="text-muted-foreground">Aulas compartilhadas com a Lista de Presença. Horários de Brasília.</p>
    </div>
    <div className="rounded-lg border p-4 text-sm bg-muted/30">
      <p>Preparação para Google Meet: os links ainda não são gerados automaticamente.</p>
      <p className="text-muted-foreground mt-1">A prévia abaixo mostra onde o professor verá o link. Entrega pelo Telegram e reagendamento pelo bot aguardam integração.</p>
    </div>
    <div className="flex items-end gap-3">
      <div><Label htmlFor="agenda-mes">Mês das aulas</Label><Input id="agenda-mes" type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(0); }} /></div>
      <Button variant="outline" disabled={!validMonth || query.isFetching} onClick={() => void query.refetch()}>Atualizar</Button>
    </div>
    {!validMonth ? <p>Selecione um mês válido.</p> : query.isPending ? <p role="status">Carregando aulas…</p> : query.isError ?
      <p role="alert">Não foi possível carregar a agenda. Verifique seu acesso e tente atualizar.</p> : <>
        {aulas.length === 0 ? <p>Nenhuma aula neste período. As aulas cadastradas na Lista de Presença aparecerão aqui.</p> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{aulas.map(aula => <Card key={aula.id}><CardContent className="p-4 space-y-2">
            <h2 className="font-semibold">{aula.modulo || 'Aula'} · {aula.turma?.nome || 'Turma não disponível'}</h2>
            <p>{aula.data.split('-').reverse().join('/')} · {aula.horario_inicio?.slice(0, 5) || 'Sem horário'} – {aula.horario_fim?.slice(0, 5) || 'Sem horário'}</p>
            <p className="text-sm text-muted-foreground">{aula.professor?.nome || 'Professor não disponível'} · {aula.status}</p>
            <p className="text-sm">{meetUrl(aula.link_meet) ? 'Link do Meet disponível' : 'Aguardando link do Meet'}</p>
            <Button variant="outline" onClick={() => setSelectedId(aula.id)}>Prévia para o professor</Button>
          </CardContent></Card>)}</div>}
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span>Página {page + 1}</span>
          <Button variant="outline" disabled={(query.data?.length ?? 0) <= 50} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </>}
    {selected ? <section className="rounded-xl border border-primary/30 p-5 space-y-3" aria-label="Prévia para o professor">
      <h2 className="font-semibold">Prévia interna · {selected.professor?.nome || 'Professor'}</h2>
      <p>{selected.modulo || 'Aula'} — {selected.turma?.nome || 'Turma'}</p>
      <p>{selected.data.split('-').reverse().join('/')} às {selected.horario_inicio?.slice(0, 5)} (Brasília)</p>
      {link && selected.status === 'agendada' ? <Button asChild><a href={link} target="_blank" rel="noopener noreferrer"><Video className="h-4 w-4 mr-2" />Entrar no Google Meet</a></Button> :
        <Button disabled>{selected.status !== 'agendada' ? 'Aula não agendada' : 'Aguardando link do Meet'}</Button>}
      <p className="text-sm text-muted-foreground">O link de presença será incluído quando o fluxo da Lista de Presença estiver disponível. Esta prévia não envia mensagens.</p>
    </section> : null}
  </div>;
}
