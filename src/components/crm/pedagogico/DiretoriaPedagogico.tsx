import { useEffect, useState } from 'react';
import {
  CalendarCheck2, ClipboardList, FileCheck2, GraduationCap, MessageSquareWarning,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { StatTile, SectionBar } from '@/components/crm/ui/premium';

interface Aula { id: string; data: string; turma_id: string; profissional_id: string | null; }
interface Presenca { aula_id: string; }
interface Avaliacao { id: string; titulo: string; status: string; modulo: string | null; }
interface Revisao { id: string; avaliacao_id: string; autor_nome: string; comentario: string; criado_em: string; }

function inicioMesBrasil() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}-01`;
}

function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function useDiretoriaPedagogico() {
  const [aulasHoje, setAulasHoje] = useState(0);
  const [aulasRealizadasMes, setAulasRealizadasMes] = useState(0);
  const [aulasSemPresencaProf, setAulasSemPresencaProf] = useState<(Aula & { turmaNome: string; profissionalNome: string })[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [revisoesPendentes, setRevisoesPendentes] = useState<Revisao[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    const inicioMes = inicioMesBrasil();
    const hoje = hojeBrasil();
    void (async () => {
      setCarregando(true);
      const [hojeRes, mesCountRes, aulasMesRes, avalRes, revRes] = await Promise.all([
        supabase.from('aulas').select('id', { count: 'exact', head: true }).eq('data', hoje),
        supabase.from('aulas').select('id', { count: 'exact', head: true }).eq('status', 'realizada').gte('data', inicioMes),
        supabase.from('aulas').select('id, data, turma_id, profissional_id').eq('status', 'realizada').gte('data', inicioMes),
        supabase.from('ped_avaliacoes').select('id, titulo, status, modulo').order('created_at', { ascending: false }),
        supabase.from('ped_revisoes').select('id, avaliacao_id, autor_nome, comentario, criado_em').eq('status', 'pendente').order('criado_em', { ascending: false }),
      ]);
      if (!ativo) return;
      setAulasHoje(hojeRes.count ?? 0);
      setAulasRealizadasMes(mesCountRes.count ?? 0);
      setAvaliacoes((avalRes.data as Avaliacao[]) ?? []);
      setRevisoesPendentes((revRes.data as Revisao[]) ?? []);

      // Aulas do mês marcadas "realizada" mas sem o professor confirmar presença pelo
      // link próprio — mesmo critério usado no RH (folha-preview.ts) pra saber quais
      // aulas ainda não têm presença confiável.
      const aulasMes = (aulasMesRes.data as Aula[]) ?? [];
      if (aulasMes.length > 0) {
        const aulaIds = aulasMes.map(a => a.id);
        const [presRes, turmasRes, profsRes] = await Promise.all([
          supabase.from('presencas').select('aula_id').eq('tipo', 'professor').eq('presente', true).in('aula_id', aulaIds),
          supabase.from('turmas').select('id, nome'),
          supabase.from('profissionais').select('id, nome'),
        ]);
        if (!ativo) return;
        const confirmadas = new Set(((presRes.data as Presenca[]) ?? []).map(p => p.aula_id));
        const turmaNomePorId = new Map(((turmasRes.data ?? []) as { id: string; nome: string }[]).map(t => [t.id, t.nome]));
        const profNomePorId = new Map(((profsRes.data ?? []) as { id: string; nome: string }[]).map(p => [p.id, p.nome]));
        setAulasSemPresencaProf(
          aulasMes
            .filter(a => !confirmadas.has(a.id))
            .map(a => ({
              ...a,
              turmaNome: turmaNomePorId.get(a.turma_id) ?? '—',
              profissionalNome: a.profissional_id ? (profNomePorId.get(a.profissional_id) ?? '—') : '—',
            }))
            .sort((a, b) => b.data.localeCompare(a.data)),
        );
      } else {
        setAulasSemPresencaProf([]);
      }
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  return { aulasHoje, aulasRealizadasMes, aulasSemPresencaProf, avaliacoes, revisoesPendentes, carregando };
}

const DECISOES = [
  { titulo: 'Correção de avaliação', texto: 'Maioria das questões é dissertativa — a IA já sabe a resposta esperada de cada módulo, corrige e dá nota. Manda um resumo pra professora só aprovar ou reprovar, nunca corrige do zero.' },
  { titulo: 'Identificação do aluno', texto: 'Confirma nome, CPF e data de nascimento (tolerância de 1 dia por cadastros antigos com fuso errado) contra a matrícula ativa. Não é autenticação forte — OTP é melhoria futura, ainda não construído.' },
  { titulo: 'Reagendamento de aula', texto: 'Decisão do Pedro (14/10/2026): a Jocimara conversa direto com o bot e a IA executa a ação de verdade a partir da mensagem dela, sem fase manual antes — mesmo com risco de erro no caminho. Ainda não construído.' },
  { titulo: 'Presença por aula', texto: 'Professor e aluno confirmam por link próprio, validado por CPF. Quem bate por CPF mas erra outro campo cai em fila de revisão manual em vez de travar — mesma fila que o RH usa pra folha.' },
  { titulo: 'Avaliações — bloqueio real', texto: 'Falta o time pedagógico mandar as perguntas de prova/trabalho de cada módulo. Sem isso não dá pra desenhar o gabarito esperado da IA — só o piloto de Fundamentos da Psicanálise existe, como rascunho privado.' },
  { titulo: 'Frequência e evasão', texto: '⚪ Ainda não construído. É o dado que falta pra fechar o ciclo: presença por aula já existe, mas ninguém ainda soma isso em frequência do aluno ao longo do curso.' },
];

export function DiretoriaPedagogico() {
  const { aulasHoje, aulasRealizadasMes, aulasSemPresencaProf, avaliacoes, revisoesPendentes, carregando } = useDiretoriaPedagogico();

  const avaliacoesPublicadas = avaliacoes.filter(a => a.status === 'publicada').length;
  const avaliacoesRascunho = avaliacoes.filter(a => a.status === 'rascunho').length;

  return (
    <div className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GraduationCap className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Diretoria — Pedagógico</h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Garantir que o aluno aprenda, seja avaliado com critério e tenha presença confiável em cada
            aula. Painel em tempo real abaixo; playbook e decisões já tomadas no final.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Aulas hoje / realizadas no mês" value={carregando ? '—' : `${aulasHoje} / ${aulasRealizadasMes}`} icon={CalendarCheck2} />
          <StatTile label="Presença do professor pendente" value={carregando ? '—' : aulasSemPresencaProf.length} icon={ClipboardList} tom={aulasSemPresencaProf.length > 0 ? 'atencao' : 'padrao'} />
          <StatTile label="Avaliações publicadas / rascunho" value={carregando ? '—' : `${avaliacoesPublicadas} / ${avaliacoesRascunho}`} icon={FileCheck2} />
          <StatTile label="Revisões de avaliação pendentes" value={carregando ? '—' : revisoesPendentes.length} icon={MessageSquareWarning} tom={revisoesPendentes.length > 0 ? 'atencao' : 'padrao'} />
        </section>

        {aulasSemPresencaProf.length > 0 && (
          <Card className="border-amber-300/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Aulas do mês sem o professor confirmar presença" icon={ClipboardList} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Turma</th><th className="p-2">Professor</th>
                  </tr></thead>
                  <tbody>
                    {aulasSemPresencaProf.map(a => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{new Date(`${a.data}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                        <td className="p-2 font-medium">{a.turmaNome}</td>
                        <td className="p-2 text-muted-foreground">{a.profissionalNome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Avaliações" icon={FileCheck2} />
            {carregando ? <p className="text-sm text-muted-foreground">Carregando...</p> : avaliacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação criada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Título</th><th className="p-2">Módulo</th><th className="p-2">Status</th>
                  </tr></thead>
                  <tbody>
                    {avaliacoes.map(a => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-2 font-medium">{a.titulo}</td>
                        <td className="p-2 text-muted-foreground">{a.modulo || '—'}</td>
                        <td className="p-2 text-muted-foreground capitalize">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {revisoesPendentes.length > 0 && (
          <Card className="border-amber-300/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <SectionBar title="Comentários de revisão pendentes" icon={MessageSquareWarning} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Quando</th><th className="p-2">Autor</th><th className="p-2">Comentário</th>
                  </tr></thead>
                  <tbody>
                    {revisoesPendentes.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{new Date(r.criado_em).toLocaleString('pt-BR')}</td>
                        <td className="p-2 font-medium">{r.autor_nome}</td>
                        <td className="p-2 text-muted-foreground max-w-sm truncate" title={r.comentario}>{r.comentario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <SectionBar title="Playbook e decisões já tomadas" icon={GraduationCap} />
            <div className="grid gap-3 sm:grid-cols-2">
              {DECISOES.map(d => (
                <div key={d.titulo} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{d.titulo}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d.texto}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
