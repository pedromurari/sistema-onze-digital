export interface RegraReceitaOutraFornecedor {
  match: string;
  pct_pedro: number;
}

export interface RegraCustoDedicadoFornecedor {
  match: string;
  socio: 'pedro' | 'rodrygo';
}

export interface RegrasSocio {
  eventos_npa_pct_pedro: number;
  custo_fixo_pct_pedro: number;
  custo_evento_pct_pedro: number;
  professoras_por_proporcao_mensalidade: boolean;
  receita_outra_default_pct_pedro: number;
  receita_outra_por_fornecedor: RegraReceitaOutraFornecedor[];
  custo_dedicado_por_fornecedor: RegraCustoDedicadoFornecedor[];
}

/**
 * Espelha, sem reinterpretar, a regra que existia embutida no DRE por sócio.
 * Manter o default no código é deliberado: uma linha antiga com `{}`, uma coluna
 * temporariamente indisponível ou um JSON parcialmente corrompido não podem mudar
 * silenciosamente a divisão financeira usada até hoje.
 */
export const REGRAS_SOCIO_DEFAULT: RegrasSocio = {
  eventos_npa_pct_pedro: 50,
  custo_fixo_pct_pedro: 50,
  custo_evento_pct_pedro: 50,
  professoras_por_proporcao_mensalidade: true,
  receita_outra_default_pct_pedro: 50,
  receita_outra_por_fornecedor: [
    { match: 'zaffalon', pct_pedro: 100 },
    { match: 'dksoft', pct_pedro: 0 },
    { match: 'life sorrisos', pct_pedro: 0 },
    { match: 'pnl', pct_pedro: 50 },
  ],
  custo_dedicado_por_fornecedor: [
    { match: 'voomp', socio: 'rodrygo' },
    { match: 'google workspace', socio: 'rodrygo' },
  ],
};

const objeto = (valor: unknown): Record<string, unknown> =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};

const percentual = (valor: unknown, fallback: number) => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) && convertido >= 0 && convertido <= 100
    ? convertido
    : fallback;
};

const clonarReceitasDefault = () =>
  REGRAS_SOCIO_DEFAULT.receita_outra_por_fornecedor.map((regra) => ({ ...regra }));

const clonarCustosDefault = () =>
  REGRAS_SOCIO_DEFAULT.custo_dedicado_por_fornecedor.map((regra) => ({ ...regra }));

/**
 * JSONB é uma fronteira sem garantia de shape. A normalização aceita configuração
 * parcial, preserva arrays vazios intencionais e descarta somente linhas inválidas;
 * quando o campo inteiro é lixo, volta ao default correspondente.
 */
export function normalizarRegrasSocio(valor: unknown): RegrasSocio {
  const atual = objeto(valor);

  const receitas = Array.isArray(atual.receita_outra_por_fornecedor)
    ? atual.receita_outra_por_fornecedor.flatMap((item) => {
        const regra = objeto(item);
        const match = typeof regra.match === 'string' ? regra.match.trim() : '';
        if (!match) return [];
        return [{
          match,
          pct_pedro: percentual(regra.pct_pedro, REGRAS_SOCIO_DEFAULT.receita_outra_default_pct_pedro),
        }];
      })
    : clonarReceitasDefault();

  const custos = Array.isArray(atual.custo_dedicado_por_fornecedor)
    ? atual.custo_dedicado_por_fornecedor.flatMap((item) => {
        const regra = objeto(item);
        const match = typeof regra.match === 'string' ? regra.match.trim() : '';
        const socio: RegraCustoDedicadoFornecedor['socio'] | null =
          regra.socio === 'pedro' || regra.socio === 'rodrygo' ? regra.socio : null;
        return match && socio ? [{ match, socio }] : [];
      })
    : clonarCustosDefault();

  return {
    eventos_npa_pct_pedro: percentual(
      atual.eventos_npa_pct_pedro,
      REGRAS_SOCIO_DEFAULT.eventos_npa_pct_pedro,
    ),
    custo_fixo_pct_pedro: percentual(
      atual.custo_fixo_pct_pedro,
      REGRAS_SOCIO_DEFAULT.custo_fixo_pct_pedro,
    ),
    custo_evento_pct_pedro: percentual(
      atual.custo_evento_pct_pedro,
      REGRAS_SOCIO_DEFAULT.custo_evento_pct_pedro,
    ),
    professoras_por_proporcao_mensalidade:
      typeof atual.professoras_por_proporcao_mensalidade === 'boolean'
        ? atual.professoras_por_proporcao_mensalidade
        : REGRAS_SOCIO_DEFAULT.professoras_por_proporcao_mensalidade,
    receita_outra_default_pct_pedro: percentual(
      atual.receita_outra_default_pct_pedro,
      REGRAS_SOCIO_DEFAULT.receita_outra_default_pct_pedro,
    ),
    receita_outra_por_fornecedor: receitas,
    custo_dedicado_por_fornecedor: custos,
  };
}
