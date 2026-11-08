// Vendedor(a) dedicado(a) do Divã IDM. Lista própria, separada de
// src/lib/vendedores.ts (Time Comercial), pra não misturar métricas/metas
// dos dois funis.
//
// Camila Nogueira Murari (mãe do Pedro) já atende a base comercial hoje e
// assume o Divã também (pedido do Pedro, 08/11/2026) — conta
// cmlmurari@gmail.com, já tem role 'admin' no sistema (acesso total, nada a
// mudar aí). Atende pelo WhatsApp dedicado "Divã IDM" conectado via
// WhatsApp Web no computador dela.

export interface DivaVendorRow {
  name: string;
  whatsapp?: string;
}

export const DIVA_VENDORS: DivaVendorRow[] = [
  { name: 'Camila Murari' },
];

// Placeholder até o Pedro definir a meta real de sessões/mês do vendedor do Divã.
export const DIVA_META_SESSOES_MES = 20;
