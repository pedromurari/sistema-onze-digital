import { BriefingBlogForm } from './BriefingBlogForm'

export const metadata = {
  title: 'Briefing do blog — Instituto Despertamente',
  description: 'Formulário interno para definir as regras do blog do Instituto.',
  robots: { index: false, follow: false },
}

export default function BriefingBlogPage() {
  return <BriefingBlogForm />
}
