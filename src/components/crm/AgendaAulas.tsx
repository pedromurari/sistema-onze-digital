import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, ClipboardCheck, MessageSquare, UserCheck, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AvisosGrupoDialog, useAvisoConfig } from './rh/AvisosGrupoDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NovaAulaDialog, PresencaDialog } from './rh/ListaPresenca';

// Nome da turma no banco carrega um sufixo de dono/investidor pra uso interno
// (ex: "Turma #02626/OnzeDS", "Turma #02426/Keila") -- quem só acessa o Pedagógico
// (professora, equipe) não precisa saber de quem é a turma, só o número.
function turmaNomeCurto(nome: string | null | undefined): string {
  return nome?.split('/')[0]?.trim() ?? '';
}

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
  aviso_status: 'enviado' | 'falhou' | null;
  aviso_enviado_em: string | null;
  aviso_erro: string | null;
  aviso_tentativas: number;
  turma: { nome: string; grupo_whatsapp_jid: string | null } | null;
}

function avisoPrevisto(aula: Aula, antecedencia: number) {
  if (!aula.horario_inicio) return '';
  const [h, m] = aula.horario_inicio.split(':').map(Number);
  const total = h * 60 + m - antecedencia;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function meetUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function hojeBrasil() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}

export function AgendaAulas() {
  const { user } = useAuth();
  const allowed = user?.tipo === 'admin' || user?.permissionMatrix?.pedagogico?.ver === true;
  const [month, setMonth] = useState(() => hojeBrasil().slice(0, 7));
  const [turmaId, setTurmaId] = useState('todas');
  const [periodo, setPeriodo] = useState<'futuras' | 'historico'>('futuras');
  const [page, setPage] = useState(0);
  const [novaAulaAberta, setNovaAulaAberta] = useState(false);
  const [presencaAula, setPresencaAula] = useState<Aula | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linksPresenca, setLinksPresenca] = useState<{ aulaId: string; aluno: string; professor: string | null } | null>(null);
  const [erroLinks, setErroLinks] = useState('');
  const [gerandoMeet, setGerandoMeet] = useState(false);
  const [avisosAberto, setAvisosAberto] = useState(false);
  const aviso = useAvisoConfig().data;
  const [gerandoMeetMsg, setGerandoMeetMsg] = useState('');
  const today = hojeBrasil();
  const canEdit = user?.tipo === 'admin' || user?.permissionMatrix?.pedagogico?.editar === true;
  const validMonth = month === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const nextMonth = validMonth ? `${Number(month.slice(0, 4)) + (month.endsWith('-12') ? 1 : 0)}-${String(Number(month.slice(5)) % 12 + 1).padStart(2, '0')}-01` : '';
  const turmasQuery = useQuery({
    queryKey: ['agenda-aulas-turmas', user?.id],
    enabled: Boolean(allowed),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('turmas').select('id,nome').order('nome').abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
  // RLS de `profissionais` é só-RH (guarda pix/valor) -- usa a RPC que expõe só
  // id+nome+ativo pra quem tem 'pedagogico' ou 'rh', tanto pro seletor de "Nova aula"
  // quanto pro nome do professor exibido em cada card abaixo.
  const profissionaisQuery = useQuery({
    queryKey: ['agenda-aulas-profissionais', user?.id],
    enabled: Boolean(allowed),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('pedagogico_profissionais_ativos').abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
  const profissionalNomePorId = new Map((profissionaisQuery.data ?? []).map(p => [p.id, p.nome]));
  const query = useQuery({
    queryKey: ['agenda-aulas', user?.id, today, month, turmaId, periodo, page],
    enabled: Boolean(allowed && validMonth),
    queryFn: async ({ signal }) => {
      // Mesma tabela usada pela Lista de Presença; não duplicar os registros.
      let request = supabase.from('aulas')
        .select('id,turma_id,profissional_id,data,horario_inicio,horario_fim,modulo,status,link_meet,aviso_status,aviso_enviado_em,aviso_erro,aviso_tentativas,turma:turmas(nome,grupo_whatsapp_jid)');
      request = periodo === 'futuras'
        ? request.gte('data', month && `${month}-01` > today ? `${month}-01` : today)
        : request.lt('data', today).gte('data', month ? `${month}-01` : '1900-01-01');
      if (month) request = request.lt('data', nextMonth);
      if (turmaId !== 'todas') request = request.eq('turma_id', turmaId);
      const { data, error } = await request
        .order('data', { ascending: periodo === 'futuras' })
        .order('horario_inicio', { ascending: periodo === 'futuras' })
        .order('id', { ascending: periodo === 'futuras' })
        .range(page * 50, page * 50 + 50).abortSignal(signal).returns<Aula[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => { setSelectedId(null); }, [month, turmaId, periodo, page]);
  const aulas = (query.data ?? []).slice(0, 50);
  useEffect(() => {
    let ativo = true;
    setLinksPresenca(null); setErroLinks('');
    if (selectedId) void supabase.functions.invoke('presenca-publica', { body: { acao: 'links', aula_id: selectedId } })
      .then(async ({ data, error }) => {
        if (!ativo) return;
        if (error) {
          const detalhe = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
          setErroLinks(detalhe?.erro || 'Não foi possível carregar os links de presença.');
        } else setLinksPresenca({ ...data, aulaId: selectedId });
      });
    return () => { ativo = false; };
  }, [selectedId]);

  async function gerarMeets() {
    setGerandoMeet(true);
    const { data, error } = await supabase.functions.invoke('meet-criar-aulas', { body: {} });
    setGerandoMeet(false);
    if (error || !data) return setErroLinks('Não foi possível gerar os links do Meet.');
    if (data.erro) return setErroLinks(data.erro);
    setErroLinks('');
    setGerandoMeetMsg(data.mensagem ?? `${data.criadas} link(s) do Meet criado(s).`);
    void query.refetch();
  }

  async function copiar(value: string) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* fallback abaixo */ }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) setErroLinks('Não foi possível copiar. Selecione o endereço exibido.');
  }

  if (!allowed) return <div className="p-6">Acesso restrito à equipe com permissão de RH.</div>;

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays />Agenda de aulas</h1>
        <p className="text-muted-foreground">Aulas, Google Meet e presença no mesmo lugar. Horários de Brasília.</p>
      </div>
      {canEdit && <div className="flex gap-2">
        <Button variant="outline" onClick={() => setAvisosAberto(true)}><MessageSquare className="h-4 w-4 mr-2" />Avisos no grupo</Button>
        <Button variant="outline" disabled={gerandoMeet} onClick={() => void gerarMeets()}><Video className="h-4 w-4 mr-2" />{gerandoMeet ? 'Gerando...' : 'Gerar links do Meet'}</Button>
        <Button onClick={() => setNovaAulaAberta(true)} disabled={!turmasQuery.data?.length || profissionaisQuery.isPending}><CalendarPlus className="h-4 w-4 mr-2" />Nova aula</Button>
      </div>}
    </div>
    {gerandoMeetMsg && <p role="status" className="text-sm text-emerald-500">{gerandoMeetMsg}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <div><Label htmlFor="agenda-periodo">Período</Label>
        <Select value={periodo} onValueChange={value => { setPeriodo(value as 'futuras' | 'historico'); setPage(0); }}>
          <SelectTrigger id="agenda-periodo" className="min-w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="futuras">Próximas aulas</SelectItem><SelectItem value="historico">Histórico</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="min-w-52"><Label htmlFor="agenda-turma">Turma</Label>
        <Select value={turmaId} onValueChange={value => { setTurmaId(value); setPage(0); }}>
          <SelectTrigger id="agenda-turma"><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as turmas</SelectItem>{(turmasQuery.data ?? []).map(turma => <SelectItem key={turma.id} value={turma.id}>{turmaNomeCurto(turma.nome)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label htmlFor="agenda-mes">Mês das aulas</Label><Input id="agenda-mes" type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(0); }} /></div>
      {month && <Button variant="ghost" onClick={() => { setMonth(''); setPage(0); }}>Todos os meses</Button>}
      <Button variant="outline" disabled={!validMonth || query.isFetching} onClick={() => void query.refetch()}>Atualizar</Button>
    </div>
    {turmasQuery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as turmas para o filtro.</p>}
    {!validMonth ? <p>Selecione um mês válido.</p> : query.isPending ? <p role="status">Carregando aulas…</p> : query.isError ?
      <p role="alert">Não foi possível carregar a agenda. Verifique seu acesso e tente atualizar.</p> : <>
        {aulas.length === 0 ? <p>Nenhuma aula encontrada para os filtros selecionados. Cadastre uma aula aqui na Agenda.</p> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{aulas.map(aula => <Card key={aula.id}><CardContent className="p-4 space-y-3">
            <h2 className="font-semibold">{aula.modulo || 'Aula'} · {turmaNomeCurto(aula.turma?.nome) || 'Turma não disponível'}</h2>
            <p>{aula.data.split('-').reverse().join('/')} · {aula.horario_inicio?.slice(0, 5) || 'Sem horário'} – {aula.horario_fim?.slice(0, 5) || 'Sem horário'}</p>
            <p className="text-sm text-muted-foreground">{(aula.profissional_id && profissionalNomePorId.get(aula.profissional_id)) || 'Professor não disponível'} · {aula.status}</p>
            {canEdit && <Button size="sm" variant="outline" onClick={() => setPresencaAula(aula)}><UserCheck className="h-4 w-4 mr-2" />Registrar presença</Button>}
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2"><Video className="h-4 w-4" /> Google Meet</p>
              {meetUrl(aula.link_meet) && aula.status === 'agendada' ? <Button size="sm" variant="outline" asChild>
                <a href={meetUrl(aula.link_meet)!} target="_blank" rel="noopener noreferrer">Abrir link do Meet</a>
              </Button> : <p className="text-sm text-muted-foreground">{aula.status !== 'agendada' ? 'Aula não agendada' : 'Aguardando link do Meet'}</p>}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Aviso no grupo</p>
              {aula.aviso_status === 'enviado' && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Enviado{aula.aviso_enviado_em ? ` às ${new Date(aula.aviso_enviado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : ''}</Badge>}
              {aula.aviso_status === 'falhou' && <div className="space-y-1">
                <Badge variant="destructive">Falhou ({aula.aviso_tentativas}/3)</Badge>
                {aula.aviso_erro && <p className="text-xs text-destructive break-all">{aula.aviso_erro}</p>}
              </div>}
              {!aula.aviso_status && aviso?.ativo && aula.turma?.grupo_whatsapp_jid && meetUrl(aula.link_meet) && aula.status === 'agendada' && <Badge variant="outline">Programado para {avisoPrevisto(aula, aviso.antecedencia_minutos)}</Badge>}
              {!aula.aviso_status && !(aviso?.ativo && aula.turma?.grupo_whatsapp_jid && meetUrl(aula.link_meet) && aula.status === 'agendada') && <p className="text-sm text-muted-foreground">{!aviso?.ativo ? 'Envio automático desligado' : !aula.turma?.grupo_whatsapp_jid ? 'Turma sem grupo vinculado' : 'Aguardando link do Meet'}</p>}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Lista de presença</p>
              <Button size="sm" variant="outline" aria-expanded={selectedId === aula.id} onClick={() => setSelectedId(current => current === aula.id ? null : aula.id)}>
                {selectedId === aula.id ? 'Ocultar links' : 'Mostrar links de presença'}
              </Button>
              {selectedId === aula.id && <div className="space-y-2 text-sm">
                {linksPresenca?.aulaId !== aula.id && !erroLinks && <p className="text-muted-foreground">Carregando links...</p>}
                {erroLinks && <p role="alert" className="text-destructive">{erroLinks}</p>}
                {linksPresenca?.aulaId === aula.id && <>
                  <p className="break-all font-mono text-xs">Alunos: {linksPresenca.aluno}</p>
                  <Button size="sm" variant="outline" onClick={() => void copiar(linksPresenca.aluno)}>Copiar link dos alunos</Button>
                  {linksPresenca.professor ? <>
                    <p className="break-all font-mono text-xs">Professor: {linksPresenca.professor}</p>
                    <Button size="sm" variant="outline" onClick={() => void copiar(linksPresenca.professor!)}>Copiar link privado do professor</Button>
                  </> : <p className="text-xs text-muted-foreground">Vincule um professor à aula para gerar o link privado.</p>}
                  <p className="text-xs text-muted-foreground">Assinaturas disponíveis no dia da aula e no dia seguinte. Envie o link do professor somente a ele.</p>
                </>}
              </div>}
            </div>
          </CardContent></Card>)}</div>}
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span>Página {page + 1}</span>
          <Button variant="outline" disabled={(query.data?.length ?? 0) <= 50} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </>}
    {avisosAberto && <AvisosGrupoDialog aberto={avisosAberto} fechar={() => setAvisosAberto(false)} />}
    {novaAulaAberta && <NovaAulaDialog turmas={turmasQuery.data ?? []} profissionais={profissionaisQuery.data ?? []} fechar={criou => { setNovaAulaAberta(false); if (criou) void query.refetch(); }} />}
    {presencaAula && <PresencaDialog aula={{ ...presencaAula, turmas: presencaAula.turma, profissionais: presencaAula.profissional_id ? { nome: profissionalNomePorId.get(presencaAula.profissional_id) ?? '' } : null }} fechar={salvou => { setPresencaAula(null); if (salvou) void query.refetch(); }} />}
  </div>;
}
