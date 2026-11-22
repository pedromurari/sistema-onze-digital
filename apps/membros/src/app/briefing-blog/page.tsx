import { Suspense } from 'react'
import { BriefingBlogForm } from './BriefingBlogForm'

export const metadata = {
  title: 'Briefing do blog — Instituto Despertamente',
  description: 'Formulário interno para definir as regras do blog do Instituto.',
  robots: { index: false, follow: false },
}

// O formulário lê o token da querystring (useSearchParams), e isso impede o
// Next de pré-renderizar a página estaticamente -- o build quebra com
// "Error occurred prerendering page /briefing-blog" se ela não for dinâmica.
export const dynamic = 'force-dynamic'

export default function BriefingBlogPage() {
  return (
    <Suspense fallback={null}>
      <BriefingBlogForm />
    </Suspense>
  )
}
