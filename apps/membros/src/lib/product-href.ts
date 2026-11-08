// Produtos que têm uma página própria (hub) em vez do visualizador genérico de curso.
const HUBS: Record<string, string> = {
  'mentoria-npa': '/mentoria-npa',
  'mentoria-nps': '/mentoria-nps',
  'formacao-psicanalise': '/formacao',
}

export function productHref(slug: string) {
  return HUBS[slug] ?? `/cursos/${slug}`
}
