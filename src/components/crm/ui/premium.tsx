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
 */
export function StatTile({
  label, value, hint, icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ElementType;
}) {
  return (
    <Card className="p-3 lg:p-4 rounded-xl border-primary/15 shadow-[0_4px_14px_-4px_rgba(169,51,86,0.15)] relative overflow-hidden">
      <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-primary/10 pointer-events-none" />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-primary">{label}</p>
        {Icon && (
          <div className="w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
      <p className="text-xl lg:text-2xl font-bold text-foreground mt-1 relative">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 relative">{hint}</p>}
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
