import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ProgramaContent, type ProductData } from '@/components/marketing/ProgramaContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'

const PRODUCT_SLUG = 'practitioner-pnl'

export const metadata = {
  title: 'Practitioner em PNL',
  description: 'Formação em Programação Neurolinguística: rapport, ancoragem, submodalidades e reformulação pra você reprogramar padrões mentais na prática.',
  alternates: { canonical: '/programas/practitioner-pnl' },
  openGraph: {
    url: '/programas/practitioner-pnl',
    type: 'website',
    title: 'Practitioner em PNL',
    description: 'Reprograme seus padrões mentais e alcance resultados extraordinários.',
  },
}

export default async function PractitionerPnlPage() {
  const sb = await createClient()
  const { data } = await sb
    .from('products')
    .select('price, original_price, highlights, cta_label, checkout_url, badge_label, payment_type')
    .eq('slug', PRODUCT_SLUG)
    .eq('is_published', true)
    .maybeSingle()

  const product: ProductData | null = data
    ? {
        price: data.price as number | null,
        original_price: data.original_price as number | null,
        highlights: data.highlights as string[] | null,
        cta_label: data.cta_label as string | null,
        checkout_url: data.checkout_url as string | null,
        payment_type: data.payment_type as string | null,
      }
    : null

  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0] overflow-x-hidden">
      <NavbarComecar />
      <WhatsAppButton />
      <StickyCTA />
      <CookieBanner />
      <SchemaCurso slug={PRODUCT_SLUG} preco={product?.price ?? null} />

      <ProgramaContent
        product={product}
        waMessage="Olá! Quero entrar na lista de espera da próxima turma do Practitioner em PNL."
        proximaTurma={{ previsao: '2 de março de 2027', detalhe: '8 sessões ao vivo, uma por semana, às terças-feiras.', listaEspera: 'practitioner-pnl' }}
        eyebrow="Instituto Despertamente · Formação certificante"
        titulo={['Practitioner', 'em PNL.']}
        tagline="Programação Neurolinguística na prática: entenda como a mente cria padrões — e aprenda a técnica pra mudar os que não servem mais."
        statsLine="8 sessões ao vivo, uma por semana · todas gravadas na plataforma · certificação"
        manifesto={<>
          A PNL parte de uma ideia simples: <span className="text-[#c8c8c8]">a forma como você representa a experiência por dentro</span> —
          as imagens, sons e sensações que você associa a cada situação — é o que determina como você reage a ela.
          O Practitioner ensina a identificar essas representações e <span className="text-[#c8c8c8]">a técnica pra mudar
          o padrão quando ele não serve mais.</span>
        </>}
        incluso={[
          'Formação completa em Programação Neurolinguística',
          'Técnicas práticas de ressignificação e mudança de estado',
          'Certificado de Practitioner em PNL (44 horas), assinado por Rodrygo Murari',
          'Acesso às aulas gravadas, no seu ritmo',
        ]}
        modulos={[
          { numero: '01', titulo: 'Ressignificando o mundo', conteudo: ['Metaforando: a força da alcateia.', 'Fundamentos e pressupostos da PNL.', 'Posições perceptivas: ponto de vista e significados.', 'Sistemas representacionais VAC e as pistas oculares.'] },
          { numero: '02', titulo: 'Reprogramando a mente', conteudo: ['O poder das âncoras.', 'Ponte para o futuro: o ensaio mental.', 'Rapport: conexão, confiança e harmonia.', 'Conceito de partes: uma vida mais equilibrada.'] },
          { numero: '03', titulo: 'Transformando resultados', conteudo: ['Submodalidades: as qualidades sensoriais de uma experiência.', 'Congruência: viver a sua verdade interior.', 'Intervenções: exercícios e práticas ao vivo em mentoria de grupo.', 'Pistas ocultas: os processos internos dos pensamentos.'] },
        ]}
        certificado={{
          frente: '/images/certificado-pnl-frente.jpg',
          verso: '/images/certificado-pnl-verso.jpg',
          titulo: 'Certificado Practitioner em PNL',
          texto: 'Ao concluir, você recebe o certificado do Curso Essencial Practitioner em PNL, assinado por Rodrygo Murari, Master Practitioner em PNL, com o conteúdo programático no verso.',
          itens: ['Carga horária de 44 horas, em 3 meses', 'Encontros ao vivo pelo Google Meet', 'Aulas gravadas, materiais, tarefas e questionários na plataforma'],
        }}
        faqItems={[
          { q: 'Esse certificado me permite atuar como profissional de PNL?', a: 'Sim — o certificado de Practitioner é o primeiro nível reconhecido internacionalmente na carreira de PNL, usado tanto para uso pessoal quanto para quem quer atender ou aplicar em coaching, vendas e liderança.' },
          { q: 'Preciso de formação anterior em psicologia ou terapia?', a: 'Não. A formação foi desenhada pra quem está começando do zero em PNL — profissional de saúde, coach, líder ou qualquer pessoa interessada em entender e mudar seus próprios padrões.' },
          { q: 'As aulas são ao vivo ou gravadas?', a: 'As aulas ficam gravadas na plataforma, no seu ritmo. Eventuais encontros ao vivo de prática são avisados com antecedência.' },
          { q: 'Tem garantia de reembolso?', a: 'Garantia de 7 dias. Se não fizer sentido pra você, devolvemos o valor investido.' },
        ]}
      />

      <SiteFooter />
    </div>
  )
}
