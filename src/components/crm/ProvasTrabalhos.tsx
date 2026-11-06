import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileCheck2,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SectionBar, StatTile } from '@/components/crm/ui/premium';

// Descoberto em 06/11/2026: ped_avaliacoes/ped_questoes já existiam no banco
// com um piloto real de 5 questões discursivas (Fundamentos da Psicanálise),
// inseridas direto via SQL -- mas sem nenhuma tela pra editar. Esta tela é
// esse editor. Bloqueio real continua o mesmo (ROADMAP.md item 4): correção
// por IA e formulário do aluno dependem do conteúdo de cada módulo chegar.
// Aqui é só a parte que não depende disso -- o time pedagógico sobe
// avaliação + questão + gabarito sozinho, sem precisar pedir pra programar.

type StatusAvaliacao = 'rascunho' | 'publicada' | 'encerrada';
type TipoQuestao = 'objetiva' | 'discursiva' | 'envio_trabalho';

interface Avaliacao {
  id: string;
  titulo: string;
  modulo: string | null;
  tipo: 'prova' | 'trabalho';
  turma_id: string | null;
  instrucoes: string | null;
  status: StatusAvaliacao;
  created_at: string;
}

interface Questao {
  id: string;
  avaliacao_id: string;
  ordem: number;
  tipo: TipoQuestao;
  enunciado: string;
  opcoes: string[] | null;
  resposta_correta: string | null;
  resposta_esperada: string | null;
  criterios_correcao: string | null;
  pontos: number;
}

interface Turma { id: string; nome: string; }

const STATUS_LABEL: Record<StatusAvaliacao, string> = { rascunho: 'Rascunho', publicada: 'Publicada', encerrada: 'Encerrada' };
const STATUS_TOM: Record<StatusAvaliacao, string> = {
  rascunho: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  publicada: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  encerrada: 'border-border bg-muted text-muted-foreground',
};

function novaQuestaoPadrao(avaliacaoId: string, ordem: number) {
  return {
    avaliacao_id: avaliacaoId,
    ordem,
    tipo: 'objetiva' as TipoQuestao,
    enunciado: 'Nova questão',
    opcoes: ['', ''],
    resposta_correta: null,
    resposta_esperada: null,
    criterios_correcao: null,
    pontos: 1,
  };
}

function QuestaoEditor({
  questao, onSalvo, onExcluida, onMover, podeSubir, podeDescer,
}: {
  questao: Questao;
  onSalvo: () => void;
  onExcluida: () => void;
  onMover: (direcao: 'cima' | 'baixo') => void;
  podeSubir: boolean;
  podeDescer: boolean;
}) {
  const [rascunho, setRascunho] = useState<Questao>(questao);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const sujo = JSON.stringify(rascunho) !== JSON.stringify(questao);

  useEffect(() => { setRascunho(questao); }, [questao]);

  const salvar = async () => {
    if (!rascunho.enunciado.trim() || rascunho.enunciado.trim().length < 3) { toast.error('A pergunta precisa ter pelo menos 3 caracteres.'); return; }
    if (!rascunho.pontos || rascunho.pontos <= 0) { toast.error('A pontuação precisa ser maior que zero.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('ped_questoes').update({
      tipo: rascunho.tipo,
      enunciado: rascunho.enunciado.trim(),
      opcoes: rascunho.tipo === 'objetiva' ? (rascunho.opcoes ?? []).filter(o => o.trim()) : null,
      resposta_correta: rascunho.tipo === 'objetiva' ? rascunho.resposta_correta : null,
      resposta_esperada: rascunho.tipo !== 'objetiva' ? (rascunho.resposta_esperada || null) : null,
      criterios_correcao: rascunho.tipo !== 'objetiva' ? (rascunho.criterios_correcao || null) : null,
      pontos: rascunho.pontos,
    }).eq('id', rascunho.id);
    setSalvando(false);
    if (error) { toast.error('Não foi possível salvar a questão.'); return; }
    toast.success('Questão salva.');
    onSalvo();
  };

  const excluir = async () => {
    setExcluindo(true);
    const { error } = await supabase.from('ped_questoes').delete().eq('id', rascunho.id);
    setExcluindo(false);
    if (error) { toast.error('Não foi possível excluir a questão.'); return; }
    onExcluida();
  };

  const opcoes = rascunho.opcoes ?? [];

  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={rascunho.tipo} onValueChange={(v: TipoQuestao) => setRascunho({ ...rascunho, tipo: v, opcoes: v === 'objetiva' ? (rascunho.opcoes ?? ['', '']) : rascunho.opcoes })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="objetiva">Objetiva</SelectItem>
            <SelectItem value="discursiva">Discursiva</SelectItem>
            <SelectItem value="envio_trabalho">Envio de trabalho</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!podeSubir} onClick={() => onMover('cima')}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!podeDescer} onClick={() => onMover('baixo')}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => void excluir()} disabled={excluindo}>
            {excluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <Textarea
        value={rascunho.enunciado}
        onChange={e => setRascunho({ ...rascunho, enunciado: e.target.value })}
        placeholder="Digite a pergunta ou o enunciado do trabalho"
        rows={2}
      />

      {rascunho.tipo === 'objetiva' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Opções — marque a correta</p>
          {opcoes.map((op, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correta-${rascunho.id}`}
                checked={rascunho.resposta_correta === op && op.trim() !== ''}
                onChange={() => setRascunho({ ...rascunho, resposta_correta: op })}
                className="h-4 w-4 accent-primary flex-shrink-0"
              />
              <Input
                value={op}
                onChange={e => {
                  const novasOpcoes = [...opcoes];
                  const antiga = novasOpcoes[i];
                  novasOpcoes[i] = e.target.value;
                  setRascunho({
                    ...rascunho,
                    opcoes: novasOpcoes,
                    resposta_correta: rascunho.resposta_correta === antiga ? e.target.value : rascunho.resposta_correta,
                  });
                }}
                placeholder={`Opção ${i + 1}`}
              />
              <Button
                variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-destructive"
                disabled={opcoes.length <= 2}
                onClick={() => {
                  const removida = opcoes[i];
                  setRascunho({
                    ...rascunho,
                    opcoes: opcoes.filter((_, idx) => idx !== i),
                    resposta_correta: rascunho.resposta_correta === removida ? null : rascunho.resposta_correta,
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRascunho({ ...rascunho, opcoes: [...opcoes, ''] })} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Opção
          </Button>
        </div>
      )}

      {rascunho.tipo === 'discursiva' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Resposta esperada (a IA vai usar pra corrigir)</p>
            <Textarea
              value={rascunho.resposta_esperada ?? ''}
              onChange={e => setRascunho({ ...rascunho, resposta_esperada: e.target.value })}
              placeholder="O que uma resposta correta precisa conter"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Critério de correção / pontuação parcial</p>
            <Textarea
              value={rascunho.criterios_correcao ?? ''}
              onChange={e => setRascunho({ ...rascunho, criterios_correcao: e.target.value })}
              placeholder="Ex: 1 ponto por isto, 0,5 ponto por aquilo"
              rows={3}
            />
          </div>
        </div>
      )}

      {rascunho.tipo === 'envio_trabalho' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Instruções de correção (opcional — pra quem revisar o arquivo enviado)</p>
          <Textarea
            value={rascunho.criterios_correcao ?? ''}
            onChange={e => setRascunho({ ...rascunho, criterios_correcao: e.target.value })}
            placeholder="O que observar no arquivo/trabalho enviado"
            rows={2}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Pontos
          <Input
            type="number" min={0.5} step={0.5}
            value={rascunho.pontos}
            onChange={e => setRascunho({ ...rascunho, pontos: Number(e.target.value) || 0 })}
            className="h-8 w-20"
          />
        </label>
        <Button size="sm" onClick={() => void salvar()} disabled={salvando || !sujo} className="gap-1.5">
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
        </Button>
      </div>
    </div>
  );
}

function AvaliacaoCard({ avaliacao, questoes, turmaNome, onMudou }: { avaliacao: Avaliacao; questoes: Questao[]; turmaNome: string | null; onMudou: () => void }) {
  const ordenadas = [...questoes].sort((a, b) => a.ordem - b.ordem);

  const adicionarQuestao = async () => {
    const maiorOrdem = ordenadas.reduce((max, q) => Math.max(max, q.ordem), 0);
    const { error } = await supabase.from('ped_questoes').insert(novaQuestaoPadrao(avaliacao.id, maiorOrdem + 1));
    if (error) { toast.error('Não foi possível adicionar a questão.'); return; }
    onMudou();
  };

  const mudarStatus = async (status: StatusAvaliacao) => {
    const { error } = await supabase.from('ped_avaliacoes').update({ status }).eq('id', avaliacao.id);
    if (error) { toast.error('Não foi possível atualizar o status.'); return; }
    onMudou();
  };

  const mover = async (questao: Questao, direcao: 'cima' | 'baixo') => {
    const idx = ordenadas.findIndex(q => q.id === questao.id);
    const vizinhoIdx = direcao === 'cima' ? idx - 1 : idx + 1;
    if (vizinhoIdx < 0 || vizinhoIdx >= ordenadas.length) return;
    const vizinho = ordenadas[vizinhoIdx];
    await Promise.all([
      supabase.from('ped_questoes').update({ ordem: vizinho.ordem }).eq('id', questao.id),
      supabase.from('ped_questoes').update({ ordem: questao.ordem }).eq('id', vizinho.id),
    ]);
    onMudou();
  };

  const totalPontos = ordenadas.reduce((s, q) => s + Number(q.pontos || 0), 0);

  return (
    <Card className={`border-border/70 shadow-sm ${avaliacao.status === 'encerrada' ? 'opacity-60' : ''}`}>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-foreground">{avaliacao.titulo}</h2>
              <Badge variant="outline" className="text-xs">{avaliacao.tipo === 'prova' ? 'Prova' : 'Trabalho'}</Badge>
              {avaliacao.modulo && <Badge variant="secondary" className="text-xs">{avaliacao.modulo}</Badge>}
              {turmaNome && <Badge variant="secondary" className="text-xs">{turmaNome}</Badge>}
              <Badge variant="outline" className={`text-xs ${STATUS_TOM[avaliacao.status]}`}>{STATUS_LABEL[avaliacao.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{ordenadas.length} {ordenadas.length === 1 ? 'questão' : 'questões'} · {totalPontos} pontos</p>
          </div>
          <Select value={avaliacao.status} onValueChange={(v: StatusAvaliacao) => void mudarStatus(v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="publicada">Publicada</SelectItem>
              <SelectItem value="encerrada">Encerrada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {ordenadas.map((q, i) => (
            <QuestaoEditor
              key={q.id}
              questao={q}
              onSalvo={onMudou}
              onExcluida={onMudou}
              onMover={dir => void mover(q, dir)}
              podeSubir={i > 0}
              podeDescer={i < ordenadas.length - 1}
            />
          ))}
        </div>

        <Button variant="outline" onClick={() => void adicionarQuestao()} className="gap-1.5">
          <Plus className="h-4 w-4" /> Adicionar questão
        </Button>
      </CardContent>
    </Card>
  );
}

export function ProvasTrabalhos() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [modulo, setModulo] = useState('');
  const [tipo, setTipo] = useState<'prova' | 'trabalho'>('prova');
  const [turmaId, setTurmaId] = useState<string>('nenhuma');
  const [criando, setCriando] = useState(false);

  const carregar = async () => {
    const [avRes, qRes, turmasRes] = await Promise.all([
      supabase.from('ped_avaliacoes').select('id, titulo, modulo, tipo, turma_id, instrucoes, status, created_at').order('created_at', { ascending: false }),
      supabase.from('ped_questoes').select('id, avaliacao_id, ordem, tipo, enunciado, opcoes, resposta_correta, resposta_esperada, criterios_correcao, pontos').order('ordem'),
      supabase.from('turmas').select('id, nome').order('nome'),
    ]);
    setAvaliacoes((avRes.data as Avaliacao[]) ?? []);
    setQuestoes(((qRes.data as any[]) ?? []).map(q => ({ ...q, pontos: Number(q.pontos) })));
    setTurmas((turmasRes.data as Turma[]) ?? []);
    setCarregando(false);
  };

  useEffect(() => { void carregar(); }, []);

  const criarAvaliacao = async () => {
    if (!titulo.trim() || titulo.trim().length < 3 || criando) {
      if (titulo.trim().length > 0 && titulo.trim().length < 3) toast.error('O título precisa ter pelo menos 3 caracteres.');
      return;
    }
    setCriando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('ped_avaliacoes').insert({
      titulo: titulo.trim(),
      modulo: modulo.trim() || null,
      tipo,
      turma_id: turmaId === 'nenhuma' ? null : turmaId,
      status: 'rascunho',
      criado_por: userData.user?.id ?? null,
    });
    setCriando(false);
    if (error) { toast.error('Não foi possível criar a avaliação.'); return; }
    setTitulo('');
    setModulo('');
    setTipo('prova');
    setTurmaId('nenhuma');
    await carregar();
  };

  const turmaNomePorId = new Map(turmas.map(t => [t.id, t.nome]));
  const publicadas = avaliacoes.filter(a => a.status === 'publicada').length;
  const totalQuestoes = questoes.length;

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Provas e trabalhos</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Monte aqui as perguntas e o gabarito de cada avaliação. Correção automática por IA e
            formulário de resposta do aluno vêm depois — esta tela é o editor, pra não depender
            de pedir pra alguém programar toda vez que precisar subir uma prova nova.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Avaliações publicadas" value={carregando ? '—' : publicadas} icon={FileCheck2} />
          <StatTile label="Questões cadastradas" value={carregando ? '—' : totalQuestoes} icon={Check} />
        </section>

        <Card className="border-dashed border-border/70">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Nova avaliação" icon={Plus} />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex: Avaliação do Módulo 3)" className="flex-1 min-w-[220px]" />
              <Input value={modulo} onChange={e => setModulo(e.target.value)} placeholder="Módulo (opcional)" className="sm:w-56" />
              <Select value={tipo} onValueChange={(v: 'prova' | 'trabalho') => setTipo(v)}>
                <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prova">Prova</SelectItem>
                  <SelectItem value="trabalho">Trabalho</SelectItem>
                </SelectContent>
              </Select>
              <Select value={turmaId} onValueChange={setTurmaId}>
                <SelectTrigger className="sm:w-48"><SelectValue placeholder="Turma (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Sem turma (geral)</SelectItem>
                  {turmas.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => void criarAvaliacao()} disabled={criando || !titulo.trim()} className="gap-1.5">
                {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
              </Button>
            </div>
          </CardContent>
        </Card>

        {!carregando && avaliacoes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma avaliação criada ainda — comece acima.</p>
        )}

        <div className="space-y-4">
          {avaliacoes.map(av => (
            <AvaliacaoCard
              key={av.id}
              avaliacao={av}
              questoes={questoes.filter(q => q.avaliacao_id === av.id)}
              turmaNome={av.turma_id ? (turmaNomePorId.get(av.turma_id) ?? null) : null}
              onMudou={() => void carregar()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
