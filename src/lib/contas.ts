/**
 * Identificadores canônicos das contas financeiras usadas pelo Grupo DespertaMENTE.
 *
 * Esta lista vive fora dos componentes para impedir que cada tela crie rótulos, cores
 * ou valores diferentes para a mesma conta. O valor persistido no banco é sempre o
 * `id`; `label` e `cor` existem apenas para apresentação e podem evoluir sem migração.
 */
export const CONTAS = [
  { id: 'inter', label: 'Inter', cor: '#F97316' },
  { id: 'c6', label: 'C6 Bank', cor: '#27272A' },
  { id: 'mercado_pago', label: 'Mercado Pago', cor: '#009EE3' },
  { id: 'asaas', label: 'Asaas', cor: '#0030B9' },
  { id: 'voomp', label: 'Voomp', cor: '#7C3AED' },
  { id: 'outro', label: 'Outro', cor: '#64748B' },
] as const;

export type Conta = (typeof CONTAS)[number]['id'];
export type ContaConfig = (typeof CONTAS)[number];

/** Mapa derivado da fonte canônica; evita duplicar rótulos em selects, badges e CSVs. */
export const CONTA_LABELS: Record<Conta, string> = Object.fromEntries(
  CONTAS.map(({ id, label }) => [id, label]),
) as Record<Conta, string>;

/** Aceita dados desconhecidos vindos do banco ou de formulários sem coerção insegura. */
export const isConta = (value: unknown): value is Conta =>
  typeof value === 'string' && CONTAS.some(({ id }) => id === value);

/**
 * Retorna o rótulo oficial quando a conta é conhecida e um fallback legível quando
 * recebe legado/nulo. Assim, relatórios históricos não exibem `undefined` ao usuário.
 */
export const getContaLabel = (value?: string | null, fallback = 'Não informada'): string =>
  isConta(value) ? CONTA_LABELS[value] : fallback;

/** Centraliza a cor usada por indicadores, preservando contraste para dados legados. */
export const getContaCor = (value?: string | null, fallback = '#64748B'): string =>
  CONTAS.find(({ id }) => id === value)?.cor ?? fallback;
