import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ProgramaContent, type ProductData } from '@/components/marketing/ProgramaContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'

const PRODUCT_SLUG = 'practitioner-pnl'

export const metadata = {
  title: 'Practitioner em PNL — Instituto Despertamente',
  description: 'Formação em Programação Neurolinguística: rapport, ancoragem, submodalidades e reformulação pra você reprogramar padrões mentais na prática.',
  openGraph: {
    title: 'Practitioner em PNL — Instituto Despertamente',
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

      <ProgramaContent
        product={product}
        waMessage="Olá! Tenho interesse no Practitioner em PNL."
        eyebrow="Instituto Despertamente · Formação certificante"
        titulo={['Practitioner', 'em PNL.']}
        tagline="Programação Neurolinguística na prática: entenda como a mente cria padrões — e aprenda a técnica pra mudar os que não servem mais."
        statsLine="Certificação Instituto Despertamente"
        manifesto={<>
          A PNL parte de uma ideia simples: <span className="text-[#c8c8c8]">a forma como você representa a experiência por dentro</span> —
          as imagens, sons e sensações que você associa a cada situação — é o que determina como você reage a ela.
          O Practitioner ensina a identificar essas representações e <span className="text-[#c8c8c8]">a técnica pra mudar
          o padrão quando ele não serve mais.</span>
        </>}
        incluso={[
          'Formação completa em Programação Neurolinguística',
          'Técnicas práticas de ressignificação e mudança de estado',
          'Certificação Instituto Despertamente ao final do programa',
          'Acesso às aulas gravadas, no seu ritmo',
        ]}
        modulos={[
          { numero: '01', titulo: 'Fundamentos da PNL', conteudo: ['O mapa não é o território: como a mente representa a experiência.', 'Os sistemas representacionais (visual, auditivo, cinestésico).'] },
          { numero: '02', titulo: 'Rapport e Calibração', conteudo: ['Como estabelecer sintonia real numa conversa ou atendimento.', 'Leitura de sinais não-verbais pra calibrar a comunicação.'] },
          { numero: '03', titulo: 'Ancoragem e Mudança de Estado', conteudo: ['Como associar um estado emocional a um estímulo específico.', 'Uso prático da ancoragem em contextos pessoais e profissionais.'] },
          { numero: '04', titulo: 'Submodalidades e Reformulação', conteudo: ['Como mudar o peso emocional de uma lembrança ou crença.', 'Técnicas de reformulação (reframe) aplicadas a crenças limitantes.'] },
          { numero: '05', titulo: 'Posições Perceptivas', conteudo: ['Como mudar de perspectiva pra resolver conflitos e bloqueios.', 'Aplicação em relações pessoais e negociação.'] },
        ]}
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
