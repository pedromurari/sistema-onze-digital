// Fonte única dos vendedores reais e da conta de comissão — antes vivia duplicado dentro
// de TimeComercial.tsx; o Dashboard precisava dos mesmos nomes/metas/cores e não tinha
// como chegar neles sem repetir a lista.
//
// Helen e Miguel ainda não são usuários reais do sistema (login em `profiles`/`user_roles`)
// — por isso a lista continua fixa aqui, não vem do AuthContext. Quando virarem contas de
// verdade, trocar por uma leitura de usuários com `tipo === 'vendedor'` e a `cor` de cada um.

export interface VendorRow {
  name: string;
  role: string;
  gerente: boolean;
  initials: string;
  cor: string;
  meta: number;
  vistaCartao: number;
  boleto: number;
}

export const INITIAL_VENDORS: VendorRow[] = [
  { name: 'Helen Magna', role: 'Vendedora', gerente: false, initials: 'HM', cor: '#A93356', meta: 30, vistaCartao: 9, boleto: 21 },
  { name: 'Miguel Fogaça', role: 'Vendedor', gerente: false, initials: 'MF', cor: '#4A90E2', meta: 30, vistaCartao: 15, boleto: 35 },
];

export const COM_VISTA_CARTAO = 147;
export const COM_RECORRENTE = 75;
export const FAT_VISTA_CARTAO = 1485;
export const FAT_RECORRENTE = 150;
export const AJUDA_CUSTO = 1500;
export const META_MOTIVO_FAT = 25000;
export const BONUS_MOTIVO = 1000;
export const META_SUPERACAO_FAT = 35000;
export const BONUS_SUPERACAO = 2000;

export function calcVendor(vistaCartao: number, boleto: number) {
  const total = vistaCartao + boleto;
  const faturamento = vistaCartao * FAT_VISTA_CARTAO + boleto * FAT_RECORRENTE;
  const comissao = vistaCartao * COM_VISTA_CARTAO + boleto * COM_RECORRENTE;
  const bonus = faturamento >= META_SUPERACAO_FAT ? BONUS_SUPERACAO : faturamento >= META_MOTIVO_FAT ? BONUS_MOTIVO : 0;
  const receber = AJUDA_CUSTO + comissao + bonus;
  return { total, faturamento, comissao, bonus, receber };
}
