import { useEffect, useState, type FormEvent } from 'react';
import { FilePenLine, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Avaliacao, type Questao, pedagogicoDb } from './avaliacoes-db';
import { MODULO_PILOTO } from './modulo-piloto';

type Turma = { id: string; nome: string };

function mensagemErro(error: { code?: string; message: string }) {
  if (error.code === '42P01' || error.code === 'PGRST205') return 'A base de avaliações ainda não foi aplicada no banco. O rascunho não foi salvo.';
  if (error.code === '42501') return 'Sua conta não tem permissão para editar avaliações.';
  return error.message;
}

export function EditorAvaliacoes() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [selecionada, setSelecionada] = useState<Avaliacao | null>(null);
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoQuestoes, setCarregandoQuestoes] = useState(false);
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [questaoAberta, setQuestaoAberta] = useState(false);
  const [editandoQuestao, setEditandoQuestao] = useState<Questao | null>(null);
  const [criandoPiloto, setCriandoPiloto] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [avaliacoesResp, turmasResp] = await Promise.all([
      pedagogicoDb.from('ped_avaliacoes').select('*').order('created_at', { ascending: false }),
      supabase.from('turmas').select('id, nome').order('nome'),
    ]);
    setAvaliacoes(avaliacoesResp.data ?? []);
    setTurmas(turmasResp.data ?? []);
    setErro(avaliacoesResp.error ? mensagemErro(avaliacoesResp.error) : '');
    setCarregando(false);
  }

  useEffect(() => { void carregar(); }, []);

  async function abrirAvaliacao(avaliacao: Avaliacao) {
    setSelecionada(avaliacao);
    setCarregandoQuestoes(true);
    const { data, error } = await pedagogicoDb.from('ped_questoes').select('*')
      .eq('avaliacao_id', avaliacao.id).order('ordem');
    setQuestoes(data ?? []);
    setCarregandoQuestoes(false);
    if (error) toast.error(mensagemErro(error));
  }

  async function criarPiloto() {
    if (criandoPiloto) return;
    setCriandoPiloto(true);
    const { data: criada, error: erroAvaliacao } = await pedagogicoDb.from('ped_avaliacoes').insert({
      titulo: MODULO_PILOTO.titulo,
      tipo: 'prova',
      modulo: MODULO_PILOTO.modulo,
      instrucoes: MODULO_PILOTO.instrucoes,
    }).select('*').single();
    if (erroAvaliacao || !criada) {
      setCriandoPiloto(false);
      toast.error(erroAvaliacao ? mensagemErro(erroAvaliacao) : 'Não foi possível criar o piloto.');
      return;
    }
    const { error: erroQuestoes } = await pedagogicoDb.from('ped_questoes').insert(
      MODULO_PILOTO.questoes.map((questao, indice) => ({
        ...questao,
        avaliacao_id: criada.id,
        ordem: indice + 1,
        tipo: 'discursiva' as const,
        pontos: 2,
      })),
    );
    setCriandoPiloto(false);
    await carregar();
    await abrirAvaliacao(criada);
    if (erroQuestoes) {
      toast.error(`O rascunho foi criado, mas as questões não foram salvas: ${mensagemErro(erroQuestoes)}`);
      return;
    }
    toast.success('Piloto privado criado. Peça revisão pedagógica antes de qualquer publicação.');
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FilePenLine className="h-4 w-4 text-primary" /> Rascunhos internos</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Crie a estrutura da avaliação e as questões. Nenhum link é publicado para alunos nesta etapa.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void criarPiloto()} disabled={criandoPiloto || carregando || !!erro}>
              {criandoPiloto ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Criar piloto do módulo 1
            </Button>
            <Button size="sm" onClick={() => setNovaAberta(true)}><Plus className="mr-1 h-4 w-4" /> Nova avaliação</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Piloto sugerido: 5 questões discursivas, 10 pontos, com gabarito e rubrica. Baseado na ementa interna e nas <a className="underline" href={MODULO_PILOTO.fonte} target="_blank" rel="noreferrer">Conferências introdutórias de Freud</a>. Ainda requer aprovação da Jocimara.</p>
        {carregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        {!carregando && !erro && avaliacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum rascunho salvo ainda.</p>}
        {!erro && avaliacoes.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-2">
              {avaliacoes.map((a) => (
                <button key={a.id} type="button" onClick={() => void abrirAvaliacao(a)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/30 ${selecionada?.id === a.id ? 'border-primary bg-primary/5' : 'border-border/60'}`}>
                  <span className="block font-medium text-sm">{a.titulo}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{a.tipo === 'prova' ? 'Prova' : 'Trabalho'} · {a.modulo || 'Módulo não definido'}</span>
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              {!selecionada ? <p className="text-sm text-muted-foreground">Selecione um rascunho para montar as questões.</p> : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{selecionada.titulo}</h3>
                      <p className="text-xs text-muted-foreground">{turmas.find((t) => t.id === selecionada.turma_id)?.nome || 'Turma não definida'} · {selecionada.modulo || 'Módulo não definido'}</p>
                    </div>
                    <Badge variant="secondary">Rascunho privado</Badge>
                  </div>
                  {selecionada.instrucoes && <p className="whitespace-pre-wrap text-sm">{selecionada.instrucoes}</p>}
                  {carregandoQuestoes ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
                    <div className="space-y-2">
                      {questoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma questão nesta avaliação.</p>}
                      {questoes.map((q) => (
                        <button key={q.id} type="button" onClick={() => { setEditandoQuestao(q); setQuestaoAberta(true); }}
                          className="block w-full rounded-lg border border-border/60 p-3 text-left hover:bg-muted/30">
                          <span className="text-xs font-semibold text-muted-foreground">Questão {q.ordem} · {q.tipo.replace('_', ' ')} · {q.pontos} ponto(s)</span>
                          <span className="mt-1 block whitespace-pre-wrap text-sm">{q.enunciado}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{q.resposta_esperada && q.criterios_correcao ? 'Gabarito e critérios registrados' : 'Gabarito/critério pendente'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setEditandoQuestao(null); setQuestaoAberta(true); }}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar questão
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      {novaAberta && <NovaAvaliacaoDialog turmas={turmas} fechar={(criada) => {
        setNovaAberta(false);
        if (criada) { void carregar(); void abrirAvaliacao(criada); }
      }} />}
      {questaoAberta && selecionada && <QuestaoDialog avaliacao={selecionada} atual={editandoQuestao}
        proximaOrdem={questoes.length ? Math.max(...questoes.map((q) => q.ordem)) + 1 : 1}
        fechar={(salvou) => { setQuestaoAberta(false); setEditandoQuestao(null); if (salvou) void abrirAvaliacao(selecionada); }} />}
    </Card>
  );
}

function NovaAvaliacaoDialog({ turmas, fechar }: { turmas: Turma[]; fechar: (criada: Avaliacao | null) => void }) {
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<Avaliacao['tipo']>('prova');
  const [turmaId, setTurmaId] = useState('');
  const [modulo, setModulo] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const { data, error } = await pedagogicoDb.from('ped_avaliacoes').insert({
      titulo: titulo.trim(), tipo, turma_id: turmaId || null,
      modulo: modulo.trim() || null, instrucoes: instrucoes.trim() || null,
    }).select('*').single();
    setSalvando(false);
    if (error || !data) return setErro(error ? mensagemErro(error) : 'Não foi possível salvar o rascunho.');
    toast.success('Rascunho criado. Ainda não está publicado.');
    fechar(data);
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(null); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Nova avaliação</DialogTitle><DialogDescription>Rascunho interno. O aluno ainda não terá acesso.</DialogDescription></DialogHeader>
      <form onSubmit={(e) => void salvar(e)} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="avaliacao-titulo">Título *</Label><Input id="avaliacao-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} minLength={3} maxLength={160} required /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="avaliacao-tipo">Tipo</Label><Select value={tipo} onValueChange={(v) => setTipo(v as Avaliacao['tipo'])}><SelectTrigger id="avaliacao-tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prova">Prova</SelectItem><SelectItem value="trabalho">Trabalho</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="avaliacao-turma">Turma</Label><Select value={turmaId} onValueChange={setTurmaId}><SelectTrigger id="avaliacao-turma"><SelectValue placeholder="Definir depois" /></SelectTrigger><SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="avaliacao-modulo">Módulo</Label><Input id="avaliacao-modulo" value={modulo} onChange={(e) => setModulo(e.target.value)} maxLength={160} /></div>
        <div className="space-y-1.5"><Label htmlFor="avaliacao-instrucoes">Instruções</Label><Textarea id="avaliacao-instrucoes" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} rows={3} /></div>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => fechar(null)} disabled={salvando}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar rascunho'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function QuestaoDialog({ avaliacao, atual, proximaOrdem, fechar }: {
  avaliacao: Avaliacao; atual: Questao | null; proximaOrdem: number; fechar: (salvou: boolean) => void;
}) {
  const [tipo, setTipo] = useState<Questao['tipo']>(atual?.tipo ?? 'discursiva');
  const [enunciado, setEnunciado] = useState(atual?.enunciado ?? '');
  const [respostaEsperada, setRespostaEsperada] = useState(atual?.resposta_esperada ?? '');
  const [criterios, setCriterios] = useState(atual?.criterios_correcao ?? '');
  const [pontos, setPontos] = useState(String(atual?.pontos ?? 1));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    const valorPontos = Number(pontos);
    if (!Number.isFinite(valorPontos) || valorPontos <= 0) return setErro('Informe uma pontuação maior que zero.');
    setSalvando(true);
    const campos = {
      tipo, enunciado: enunciado.trim(), pontos: valorPontos,
      resposta_esperada: respostaEsperada.trim() || null,
      criterios_correcao: criterios.trim() || null,
    };
    const { error } = atual
      ? await pedagogicoDb.from('ped_questoes').update(campos).eq('id', atual.id).eq('avaliacao_id', avaliacao.id)
      : await pedagogicoDb.from('ped_questoes').insert({ ...campos, avaliacao_id: avaliacao.id, ordem: proximaOrdem });
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    toast.success(atual ? 'Questão atualizada.' : 'Questão adicionada.');
    fechar(true);
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !salvando) fechar(false); }}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle>{atual ? 'Editar questão' : 'Adicionar questão'}</DialogTitle><DialogDescription>Gabarito e critérios ficam privados e serão necessários antes de ativar a correção.</DialogDescription></DialogHeader>
      <form onSubmit={(e) => void salvar(e)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
          <div className="space-y-1.5"><Label htmlFor="questao-tipo">Formato</Label><Select value={tipo} onValueChange={(v) => setTipo(v as Questao['tipo'])}><SelectTrigger id="questao-tipo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="discursiva">Discursiva</SelectItem><SelectItem value="objetiva" disabled>Objetiva (alternativas em breve)</SelectItem><SelectItem value="envio_trabalho">Envio de trabalho</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="questao-pontos">Pontos *</Label><Input id="questao-pontos" type="number" min="0.01" step="0.01" value={pontos} onChange={(e) => setPontos(e.target.value)} required /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="questao-enunciado">Enunciado *</Label><Textarea id="questao-enunciado" value={enunciado} onChange={(e) => setEnunciado(e.target.value)} minLength={3} maxLength={10000} rows={3} required /></div>
        <div className="space-y-1.5"><Label htmlFor="questao-gabarito">Resposta esperada</Label><Textarea id="questao-gabarito" value={respostaEsperada} onChange={(e) => setRespostaEsperada(e.target.value)} rows={3} /></div>
        <div className="space-y-1.5"><Label htmlFor="questao-criterios">Critérios de correção</Label><Textarea id="questao-criterios" value={criterios} onChange={(e) => setCriterios(e.target.value)} rows={3} /></div>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => fechar(false)} disabled={salvando}>Cancelar</Button><Button type="submit" disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar questão'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
