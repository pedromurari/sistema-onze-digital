/**
 * Perguntas frequentes da formacao em Constelacao Familiar.
 *
 * Mora em arquivo proprio, fora do componente, porque o mesmo dado e lido
 * de dois lados: o acordeao (client component) e o FAQPage em JSON-LD, que
 * roda no servidor. Export de modulo marcado com 'use client' chega no
 * servidor como referencia de cliente, nao como array -- usar isso em
 * render de servidor derruba a pagina (foi o que aconteceu em 22/11/2026).
 */

export const faqItems = [
  { q: 'Preciso ter conhecimento prévio em Constelação Familiar?', a: 'Não. Essa é a porta de entrada — não é necessário nenhum conhecimento prévio.' },
  { q: 'Como funciona o formato?', a: '3 meses, 8 módulos, 12 aulas, em 6 ciclos quinzenais. Cada ciclo combina um encontro ao vivo pelo Meet (1h30 a 2h) com uma semana de integração na plataforma — estudo, leitura e atividade orientada.' },
  { q: 'As aulas ficam gravadas?', a: 'Sim. Os conteúdos gravados ficam na plataforma para revisar e aprofundar, junto com apostilas, artigos, filmes indicados e as atividades de cada módulo.' },
  { q: 'Como funciona a certificação?', a: 'O certificado representa participação e percurso — as entregas não ficam concentradas no último encontro. Exige frequência mínima, participação nas vivências, atividades na plataforma, entrega do genograma, participação na prática supervisionada e aceite das orientações éticas.' },
  { q: 'Essa formação substitui terapia ou uma formação em Psicanálise?', a: 'Não. É uma formação introdutória em Constelação Familiar Sistêmica, com limites éticos claros entre facilitação, aconselhamento e psicoterapia. Não promete resultado nem substitui acompanhamento clínico.' },
  { q: 'Quais as formas de pagamento?', a: 'R$ 497 à vista no Pix, ou em até 12x de R$ 50,88 no cartão.' },
]
