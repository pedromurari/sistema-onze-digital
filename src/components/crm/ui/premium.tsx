import React from 'react';
import { Card } from '@/components/ui/card';

/**
 * Vocabulário visual do CRM (sprint 4).
 *
 * Estas peças nasceram no redesign do Time Comercial e foram COPIADAS para o IDM PSI
 * Franquias quando aquela tela recebeu o mesmo tratamento — duas definições idênticas,
 * que já começariam a divergir na terceira tela. Aqui viram fonte única.
 *
 * O padrão de página que as acompanha: header "Meu trabalho" com abas em cartão vinho,
 * `SectionBar` separando cada bloco, `StatTile` para números e tabela premium para listas.
 * Tela nova deve compor a partir daqui, não inventar um quinto estilo de card.
 */

/** Cabeçalho de tabela em degradê vinho, no lugar do cinza padrão do componente Table. */
export const PREMIUM_TABLE_HEADER_ROW =
  'border-0 [&_th]:text-primary-foreground [&_th]:font-semibold ' +
  '[&_th]:first:rounded-tl-lg [&_th]:last:rounded-tr-lg bg-gradient-to-r from-primary to-primary/80';

/** Linhas zebradas num vinho bem claro. Recebe o índice da linha. */
export const premiumZebraRow = (idx: number) => (idx % 2 === 0 ? 'bg-card' : 'bg-primary/5');

/**
 * Card de número. Label em vinho maiúsculo, ícone lucide em badge sólido e um brilho no
 * canto — para não virar bloco branco genérico.
 *
 * `tom` existe para o número que carrega julgamento — dinheiro em atraso não é igual a
 * dinheiro recebido. É semântico, não decorativo: uma tela com cinco cores diferentes,
 * uma por card, não diz nada. Por padrão todos usam o vinho da casa.
 *
 * `onClick` + `ativo` permitem que o card também seja um filtro. Sem isso, cada tela que
 * precisa disso reinventa o card e o vocabulário volta a divergir — foi o que aconteceu
 * no Financeiro, que tinha cinco cards próprios em cinco cores.
 */
export type TomStat = 'padrao' | 'bom' | 'atencao' | 'ruim';

const TOM: Record<TomStat, { rotulo: string; badge: string; brilho: string; anel: string }> = {
  padrao:  { rotulo: 'text-primary',     badge: 'bg-primary text-primary-foreground', brilho: 'bg-primary/10',   anel: 'ring-primary/40' },
  bom:     { rotulo: 'text-emerald-700', badge: 'bg-emerald-600 text-white',          brilho: 'bg-emerald-500/10', anel: 'ring-emerald-500/40' },
  atencao: { rotulo: 'text-amber-700',   badge: 'bg-amber-500 text-white',            brilho: 'bg-amber-500/10',  anel: 'ring-amber-500/40' },
  ruim:    { rotulo: 'text-red-700',     badge: 'bg-red-600 text-white',              brilho: 'bg-red-500/10',    anel: 'ring-red-500/40' },
};

export function StatTile({
  label, value, hint, icon: Icon, tom = 'padrao', onClick, ativo = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  tom?: TomStat;
  onClick?: () => void;
  ativo?: boolean;
}) {
  const c = TOM[tom];
  const conteudo = (
    <>
      <div className={`absolute -top-5 -right-5 w-20 h-20 rounded-full pointer-events-none ${c.brilho}`} />
      <div className="relative flex items-start justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-wide ${c.rotulo}`}>{label}</p>
        {Icon && (
          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${c.badge}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className="text-xl lg:text-2xl font-bold text-foreground mt-1 relative tabular-nums">{value}</p>
      {hint && <div className="text-xs text-muted-foreground mt-0.5 relative">{hint}</div>}
    </>
  );

  const base = 'p-3 lg:p-4 rounded-xl border-primary/15 shadow-[0_4px_14px_-4px_rgba(169,51,86,0.15)] relative overflow-hidden';

  if (!onClick) return <Card className={base}>{conteudo}</Card>;

  return (
    <Card
      className={`${base} cursor-pointer text-left transition-shadow hover:shadow-md ${ativo ? `ring-2 ${c.anel}` : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={ativo}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {conteudo}
    </Card>
  );
}

/**
 * Barra + título que separa blocos dentro de uma aba.
 *
 * O `subtitle` é para orientar quem está usando a tela — o que aquele bloco mostra e de
 * onde o número vem. Não é lugar para nota de implementação.
 */
export function SectionBar({
  title, subtitle, icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-5 rounded-full bg-primary flex-shrink-0" />
      {Icon && (
        <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="h-3.5 w-3.5" />
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground leading-tight mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * Cor determinística por id: o mesmo id sempre cai na mesma cor, sem precisar de coluna
 * de cor no banco. Veio do redesign de Franquias, onde os vendedores são dinâmicos.
 */
const PALETA_PESSOA = [
  '#A93356', '#4A90E2', '#2E9E6C', '#C9762C',
  '#7B5FBF', '#1D8A99', '#B8455E', '#5A7D3A',
];

export function corPorId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA_PESSOA[hash % PALETA_PESSOA.length];
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase();
}

/** Avatar circular com iniciais, colorido pelo id (ou pelo nome, quando não há id). */
export function AvatarPessoa({
  nome, id, size = 'sm',
}: {
  nome: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim =
    size === 'lg' ? 'w-12 h-12 text-base' :
    size === 'md' ? 'w-8 h-8 text-xs' :
                    'w-6 h-6 text-[10px]';
  return (
    <div
      className={`${dim} rounded-md flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: corPorId(id || nome) }}
    >
      {iniciais(nome)}
    </div>
  );
}

/**
 * Chip de filtro em pílula com degradê vinho quando ativo — o mesmo padrão que já existia
 * duplicado dentro do Time Comercial (`canalAtivo === ...`). Vira peça única aqui pelo
 * mesmo motivo do resto do arquivo: a próxima tela com filtro em pílula não deveria
 * inventar um sexto estilo de botão.
 *
 * `contagem` mostra o número dentro do próprio chip, discreto, no lugar de embutir no
 * label (`"Inadimplentes (62)"`) — texto variável dentro do texto é o tipo de coisa que
 * faz uma fileira de filtro parecer maior e menos arrumada do que é.
 */
export function FiltroChip({
  label, ativo, onClick, contagem, tom = 'padrao',
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
  contagem?: number;
  tom?: TomStat;
}) {
  const corContagem: Record<TomStat, string> = {
    padrao:  'bg-primary/15 text-primary',
    bom:     'bg-emerald-500/15 text-emerald-700',
    atencao: 'bg-amber-500/15 text-amber-700',
    ruim:    'bg-red-500/15 text-red-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        ativo
          ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm'
          : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
      }`}
    >
      {label}
      {typeof contagem === 'number' && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
          ativo ? 'bg-white/20 text-white' : corContagem[tom]
        }`}>
          {contagem}
        </span>
      )}
    </button>
  );
}
