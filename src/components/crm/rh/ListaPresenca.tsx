import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarPlus, CheckCircle2, ClipboardCheck, Link2, Loader2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Aula = Database['public']['Tables']['aulas']['Row'];
type Turma = Pick<Database['public']['Tables']['turmas']['Row'], 'id' | 'nome'>;
type Profissional = Pick<Database['public']['Tables']['profissionais']['Row'], 'id' | 'nome' | 'ativo'>;
type Aluno = Pick<Database['public']['Tables']['alunos']['Row'], 'id' | 'nome'>;
type Presenca = Database['public']['Tables']['presencas']['Row'] & { confirmado_via_link: boolean };

const STATUS_LABEL: Record<Aula['status'], { label: string; className: string }> = {
  agendada: { label: 'Agendada', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  realizada: { label: 'Realizada', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  cancelada: { label: 'Cancelada', className: 'bg-gray-500/10 text-gray-500 border-gray-500/30' },
  adiada: { label: 'Adiada', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
};

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function useListaPresenca() {
  const [aulas, setAulas] = useState<(Aula & { turmas: { nome: string } | null; profissionais: { nome: string } | null })[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [aulasResp, turmasResp, profResp] = await Promise.all([
      supabase.from('aulas').select('*, turmas(nome), profissionais(nome)').order('data', { ascending: false }),
      supabase.from('turmas').select('id, nome').order('nome'),
      supabase.from('profissionais').select('id, nome, ativo').eq('ativo', true).order('nome'),
    ]);
    if (aulasResp.error) setErro(aulasResp.error.message);
    else { setAulas(aulasResp.data as typeof aulas); setErro(''); }
    setTurmas(turmasResp.data ?? []);
    setProfissionais(profResp.data ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  return { aulas, turmas, profissionais, carregando, erro, recarregar: carregar };
}

export function NovaAulaDialog({ turmas, profissionais, fechar }: { turmas: Turma[]; profissionais: Profissional[]; fechar: (criou: boolean) => void }) {
  const [turmaId, setTurmaId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [data, setData] = useState(hojeISO());
  const [horarioInicio, setHorarioInicio] = useState('');
  const [horarioFim, setHorarioFim] = useState('');
  const [modulo, setModulo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (!turmaId) return setErro('Selecione a turma.');
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('aulas').insert({
      turma_id: turmaId,
      profissional_id: profissionalId || null,
      data,
      horario_inicio: horarioInicio || null,
      horario_fim: horarioFim || null,
      modulo: modulo.trim() || null,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    toast.success('Aula cadastrada.');
    fechar(true);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova aula</DialogTitle>
          <DialogDescription>Cadastra a aula pra depois registrar a presença de professor e alunos.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void salvar(e)} className="space-y-3">
          <fieldset disabled={salvando} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aula-turma">Turma *</Label>
              <Select value={turmaId} onValueChange={setTurmaId}>
                <SelectTrigger id="aula-turma"><SelectValue placeholder="Selecione a turma" /></SelectTrigger>
                <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aula-profissional">Professor</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger id="aula-profissional"><SelectValue placeholder="Selecione o professor" /></SelectTrigger>
                <SelectContent>{profissionais.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="aula-data">Data *</Label>
                <Input id="aula-data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aula-inicio">Início</Label>
                <Input id="aula-inicio" type="time" value={horarioInicio} onChange={(e) => setHorarioInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aula-fim">Fim</Label>
                <Input id="aula-fim" type="time" value={horarioFim} onChange={(e) => setHorarioFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aula-modulo">Módulo (opcional)</Label>
              <Input id="aula-modulo" value={modulo} maxLength={160} onChange={(e) => setModulo(e.target.value)} />
            </div>
            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
              <Button type="submit">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar aula'}</Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PresencaDialog({ aula, fechar }: { aula: Pick<Aula, 'id' | 'turma_id' | 'profissional_id'> & { turmas: { nome: string } | null; profissionais: { nome: string } | null }; fechar: (salvou: boolean) => void }) {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [existentes, setExistentes] = useState<Presenca[]>([]);
  const [professorPresente, setProfessorPresente] = useState(false);
  const [presencaAlunos, setPresencaAlunos] = useState<Record<string, boolean>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const [alunosResp, presencasResp] = await Promise.all([
        supabase.from('alunos').select('id, nome').eq('turma_id', aula.turma_id).order('nome'),
        supabase.from('presencas').select('*').eq('aula_id', aula.id),
      ]);
      const listaAlunos = alunosResp.data ?? [];
      setAlunos(listaAlunos);
      const presencasExistentes = (presencasResp.data ?? []) as Presenca[];
      setExistentes(presencasExistentes);
      const profExistente = presencasExistentes.find((p) => p.tipo === 'professor');
      setProfessorPresente(profExistente ? profExistente.presente : false);
      const mapaAlunos: Record<string, boolean> = {};
      for (const aluno of listaAlunos) {
        const existente = presencasExistentes.find((p) => p.tipo === 'aluno' && p.aluno_id === aluno.id);
        mapaAlunos[aluno.id] = existente ? existente.presente : false;
      }
      setPresencaAlunos(mapaAlunos);
      setCarregando(false);
    }
    void carregar();
  }, [aula.id, aula.turma_id]);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    // Nunca apaga nem sobrescreve uma assinatura feita pelo link público.
    // Índices únicos são parciais, então cada registro é atualizado/inserido pelo ID.
    const novos: Database['public']['Tables']['presencas']['Insert'][] = [];
    const atualizacoes: Promise<{ error: { message: string } | null }>[] = [];
    const prepararPessoa = (tipo: 'professor' | 'aluno', pessoaId: string, presente: boolean) => {
      const atual = existentes.find((p) => p.tipo === tipo && (tipo === 'professor' ? p.profissional_id : p.aluno_id) === pessoaId);
      if (atual?.confirmado_via_link || atual?.presente === presente) return;
      const dados = { presente, assinado_em: new Date().toISOString() };
      if (atual) {
        atualizacoes.push(Promise.resolve(supabase.from('presencas').update(dados).eq('id', atual.id)));
        return;
      }
      novos.push({
        aula_id: aula.id, tipo, profissional_id: tipo === 'professor' ? pessoaId : null,
        aluno_id: tipo === 'aluno' ? pessoaId : null, ...dados,
      });
    };
    if (aula.profissional_id) prepararPessoa('professor', aula.profissional_id, professorPresente);
    for (const aluno of alunos) prepararPessoa('aluno', aluno.id, presencaAlunos[aluno.id] ?? false);
    const [insercao, updates] = await Promise.all([
      novos.length ? supabase.from('presencas').insert(novos) : Promise.resolve({ error: null }),
      Promise.all(atualizacoes),
    ]);
    if (insercao.error || updates.some((result) => result.error)) {
      setSalvando(false);
      toast.error('Não foi possível salvar todas as presenças. Atualize a lista e tente novamente.');
      return;
    }

    if (professorPresente) await supabase.from('aulas').update({ status: 'realizada' }).eq('id', aula.id);
    setSalvando(false);
    toast.success('Presença registrada.');
    fechar(true);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(false); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Presença — {aula.turmas?.nome ?? 'Turma'}</DialogTitle>
          <DialogDescription>{new Date(`${aula.data}T12:00:00`).toLocaleDateString('pt-BR')}{aula.modulo ? ` · ${aula.modulo}` : ''}</DialogDescription>
        </DialogHeader>
        {carregando ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="space-y-4">
            {aula.profissional_id && (
              <label className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3 cursor-pointer">
                <Checkbox checked={professorPresente} disabled={existentes.some((p) => p.tipo === 'professor' && p.confirmado_via_link)} onCheckedChange={(v) => setProfessorPresente(v === true)} />
                <span className="text-sm font-medium">{aula.profissionais?.nome ?? 'Professor'} deu a aula</span>
                {existentes.some((p) => p.tipo === 'professor' && p.confirmado_via_link) && <Badge variant="secondary">Assinado pelo link</Badge>}
              </label>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Alunos ({alunos.length})</p>
              {alunos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aluno cadastrado nessa turma.</p>}
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {alunos.map((aluno) => (
                  <label key={aluno.id} className="flex items-center gap-2.5 rounded-lg border border-border/40 p-2 cursor-pointer hover:bg-muted/20">
                    <Checkbox
                      checked={presencaAlunos[aluno.id] ?? false}
                      disabled={existentes.some((p) => p.tipo === 'aluno' && p.aluno_id === aluno.id && p.confirmado_via_link)}
                      onCheckedChange={(v) => setPresencaAlunos((prev) => ({ ...prev, [aluno.id]: v === true }))}
                    />
                    <span className="text-sm">{aluno.nome}</span>
                    {existentes.some((p) => p.tipo === 'aluno' && p.aluno_id === aluno.id && p.confirmado_via_link) && <Badge variant="secondary">Assinado</Badge>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => fechar(false)} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando || carregando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Salvar presença</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinksPresencaDialog({ aula, fechar }: { aula: Aula & { turmas: { nome: string } | null }; fechar: () => void }) {
  const [links, setLinks] = useState<{ aluno: string; professor: string | null } | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let ativo = true;
    void supabase.functions.invoke('presenca-publica', { body: { acao: 'links', aula_id: aula.id } })
      .then(async ({ data, error }) => {
        if (!ativo) return;
        if (error) {
          const detalhe = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
          setErro(detalhe?.erro || 'Não foi possível gerar os links.');
        } else setLinks(data);
      });
    return () => { ativo = false; };
  }, [aula.id]);
  async function copiar(link: string) {
    try { await navigator.clipboard.writeText(link); toast.success('Link copiado.'); }
    catch { toast.error('Não foi possível copiar. Selecione o endereço exibido.'); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open) fechar(); }}>
    <DialogContent className="sm:max-w-lg"><DialogHeader>
      <DialogTitle>Links de presença · {aula.turmas?.nome || 'Turma'}</DialogTitle>
      <DialogDescription>Os links existem desde o cadastro da aula. A assinatura abre no dia marcado e até o dia seguinte.</DialogDescription>
    </DialogHeader>
      {!links && !erro && <Loader2 className="h-5 w-5 animate-spin" />}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {links && <div className="space-y-4 text-sm">
        <div className="space-y-1"><Label>Para enviar aos alunos</Label><p className="break-all font-mono text-xs">{links.aluno}</p><Button size="sm" variant="outline" onClick={() => void copiar(links.aluno)}>Copiar link dos alunos</Button></div>
        <div className="space-y-1"><Label>Privado do professor</Label>{links.professor ? <><p className="break-all font-mono text-xs">{links.professor}</p><Button size="sm" variant="outline" onClick={() => void copiar(links.professor!)}>Copiar link do professor</Button></> : <p className="text-muted-foreground">Vincule um professor à aula para gerar este link.</p>}</div>
        <p className="text-xs text-muted-foreground">O link do professor funciona como uma chave de assinatura: envie somente a ele. A confirmação do aluno exige matrícula ativa e conferência de nome, CPF e nascimento.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function ListaPresenca() {
  const { aulas, turmas, profissionais, carregando, erro, recarregar } = useListaPresenca();
  const [novaAulaAberta, setNovaAulaAberta] = useState(false);
  const [aulaPresenca, setAulaPresenca] = useState<(typeof aulas)[number] | null>(null);
  const [aulaLinks, setAulaLinks] = useState<(typeof aulas)[number] | null>(null);
  const [turmaFiltro, setTurmaFiltro] = useState('todas');
  const aulasFiltradas = turmaFiltro === 'todas' ? aulas : aulas.filter((a) => a.turma_id === turmaFiltro);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Cada aula registrada aqui vira a base do Fechamento de Folha (ainda não construído) e da frequência do aluno.</p>
        <Button size="sm" onClick={() => setNovaAulaAberta(true)} disabled={turmas.length === 0}>
          <CalendarPlus className="h-4 w-4 mr-1" /> Nova aula
        </Button>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Aulas
          </CardTitle>
          <div className="pt-2">
            <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as turmas</SelectItem>
                {turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {!carregando && aulasFiltradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aula cadastrada{turmaFiltro !== 'todas' ? ' nesta turma' : ''}.</p>}
          {aulasFiltradas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Data</th>
                    <th className="p-2">Turma</th>
                    <th className="p-2">Professor</th>
                    <th className="p-2">Módulo</th>
                    <th className="p-2">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {aulasFiltradas.map((aula) => (
                    <tr key={aula.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 whitespace-nowrap">{new Date(`${aula.data}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                      <td className="p-2 font-medium">{aula.turmas?.nome ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{aula.profissionais?.nome ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{aula.modulo ?? '—'}</td>
                      <td className="p-2"><Badge variant="outline" className={STATUS_LABEL[aula.status].className}>{STATUS_LABEL[aula.status].label}</Badge></td>
                      <td className="p-2">
                        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setAulaLinks(aula)}><Link2 className="h-3.5 w-3.5 mr-1" /> Links</Button>
                        <Button size="sm" variant="outline" onClick={() => setAulaPresenca(aula)}>
                          <UserCheck className="h-3.5 w-3.5 mr-1" /> Presença
                        </Button></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {novaAulaAberta && (
        <NovaAulaDialog turmas={turmas} profissionais={profissionais} fechar={(criou) => { setNovaAulaAberta(false); if (criou) void recarregar(); }} />
      )}
      {aulaPresenca && (
        <PresencaDialog aula={aulaPresenca} fechar={(salvou) => { setAulaPresenca(null); if (salvou) void recarregar(); }} />
      )}
      {aulaLinks && <LinksPresencaDialog aula={aulaLinks} fechar={() => setAulaLinks(null)} />}
    </div>
  );
}
