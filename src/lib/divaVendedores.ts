// Vendedor(a) dedicado(a) do Divã IDM — ainda a contratar (pedido do Pedro
// 27/10/2026). Lista própria, separada de src/lib/vendedores.ts (Time
// Comercial), pra não misturar métricas/metas dos dois funis. Preencher
// quando a pessoa for contratada e os números de meta/comissão forem
// fechados com o Pedro.

export interface DivaVendorRow {
  name: string;
  whatsapp?: string;
}

export const DIVA_VENDORS: DivaVendorRow[] = [];

// Placeholder até o Pedro definir a meta real de sessões/mês do vendedor do Divã.
export const DIVA_META_SESSOES_MES = 20;
