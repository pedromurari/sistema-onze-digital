// Ebook do NPA Presencial é sempre o mesmo material, independente da cidade/edição do evento —
// serve como fallback quando o evento não tem um ebook_url específico cadastrado no CRM.
export const EBOOK_URL_PADRAO = '/materiais/ebook-numerologia-do-destino.pdf'

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}
