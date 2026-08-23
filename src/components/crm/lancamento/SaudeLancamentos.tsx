import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react';
import { useSaudeDosLancamentos, type GravidadeIntegridade } from '@/lib/db';

/**
 * O que está faltando nos lançamentos, sem ninguém precisar procurar.
 *
 * As turmas #44 a #47 foram cadastradas com data em 22/07, com antecedência. Nenhuma
 * ganhou aquecimento e ninguém foi avisado — a captura caiu de 813 leads por semana para
 * 16 e o sistema não tinha onde mostrar isso. Preencher a data de um lançamento não gerava
 * sinal nenhum de que ele estava pela metade.
 *
 * Fica fechado quando não há nada. A verificação no banco foi calibrada três vezes para
 * não gritar à toa: passou de 13 pontos para 7, todos acionáveis — lançamento que já
 * terminou não aparece, só o que ainda causa dano.
 */

const ESTILO: Record<GravidadeIntegridade, string> = {
  alto:  'bg-red-100 text-red-700 border-red-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  baixo: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** "em 2 dias", "hoje", "há 12 dias" — o prazo é o que decide a urgência aqui. */
function prazo(dias: number | null) {
  if (dias === null) return null;
  if (dias === 0) return 'hoje';
  return dias > 0 ? `em ${dias} dia${dias > 1 ? 's' : ''}` : `há ${Math.abs(dias)} dias`;
}

export function SaudeLancamentos() {
  const [aberto, setAberto] = useState(false);
  const { data: pontos = [], isLoading } = useSaudeDosLancamentos();

  // Sem permissão de lançamentos a função devolve vazio, não erro.
  if (isLoading || !pontos.length) return null;

  const turmas = new Set(pontos.map(p => p.lancamento)).size;

  return (
    <Card className="rounded-xl border-primary/15 shadow-[0_4px_14px_-4px_rgba(169,51,86,0.15)] overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        className="w-full p-3 lg:p-4 flex items-center justify-between gap-3 text-left hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">
              {pontos.length} {pontos.length === 1 ? 'ponto' : 'pontos'} em {turmas}{' '}
              {turmas === 1 ? 'turma' : 'turmas'}
            </h2>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
              Aquecimento sem mensagem, live chegando sem inscrito, página capturando depois da live.
            </p>
          </div>
        </div>
        {aberto
          ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {aberto && (
        <div className="border-t border-border divide-y divide-border">
          {pontos.map((p) => (
            <div key={`${p.lancamento}-${p.problema}`} className="px-3 lg:px-4 py-2.5 flex items-start gap-3">
              <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide flex-shrink-0 mt-0.5 ${ESTILO[p.gravidade]}`}>
                {p.gravidade === 'alto' ? 'Alto' : p.gravidade === 'medio' ? 'Médio' : 'Baixo'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{p.lancamento}</span>
                  <span className="text-xs text-muted-foreground">{p.problema}</span>
                  {p.dias_ate_live !== null && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3 w-3" />
                      live {prazo(p.dias_ate_live)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{p.efeito}</p>
              </div>
            </div>
          ))}
          <p className="px-3 lg:px-4 py-2.5 text-[11px] text-muted-foreground leading-snug">
            A captura da landing page não precisa mais de tabela nem de chave por turma:
            a página posta em <code className="font-mono">/functions/v1/captura-lead</code> com
            o número da turma, e o lead cai no lançamento certo.
          </p>
        </div>
      )}
    </Card>
  );
}
