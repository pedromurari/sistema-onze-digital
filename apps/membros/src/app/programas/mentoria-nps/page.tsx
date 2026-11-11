import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ProgramaContent, type ProductData } from '@/components/marketing/ProgramaContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'

const PRODUCT_SLUG = 'mentoria-nps'

export const metadata = {
  title: 'Mentoria NPS — Numerologia Pitagórica — Instituto Despertamente',
  description: 'Dois encontros ao vivo por mês, mapas numerológicos (Mapa 7 Esferas) e acompanhamento contínuo pra você aplicar a Numerologia Pitagórica de verdade.',
  openGraph: {
    title: 'Mentoria NPS — Instituto Despertamente',
    description: 'Dois encontros por mês, gravações e até 8 mapas numerológicos por mês, enquanto a mensalidade estiver em dia.',
  },
}

export default async function MentoriaNpsPage() {
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
        waMessage="Olá! Tenho interesse na Mentoria NPS (Numerologia Pitagórica)."
        eyebrow="Instituto Despertamente · Mentoria contínua"
        titulo={['Mentoria', 'NPS.']}
        tagline="Numerologia Pitagórica aplicada, com acompanhamento ao vivo pra você virar referência na sua leitura."
        statsLine="2 encontros ao vivo / mês · Mapa 7 Esferas incluso"
        manifesto={<>
          A Numerologia Pitagórica não é tabela pronta — é <span className="text-[#c8c8c8]">leitura de padrão em movimento</span>.
          A Mentoria NPS existe pra isso: você aplica o que aprendeu no NPA, tira dúvida real de atendimento real,
          e recebe mapas numerológicos (Mapa 7 Esferas) todo mês pra praticar em cima de caso de verdade,
          <span className="text-[#c8c8c8]"> não de exercício teórico.</span>
        </>}
        incluso={[
          'Dois encontros ao vivo por mês com a equipe do IDM',
          'Gravação de todos os encontros, disponível na plataforma',
          'Até 8 mapas numerológicos (Mapa 7 Esferas) por mês, enquanto a mensalidade estiver em dia',
          'Material de apoio e grupo de prática entre mentorias',
        ]}
        modulos={[
          { numero: '01', titulo: 'Destino e Desafios da Caminhada', conteudo: ['Leitura do número de destino e como ele se expressa na prática clínica.'] },
          { numero: '02', titulo: 'Número de Imagem', conteudo: ['Como a numerologia explica a forma como a pessoa é vista pelos outros.'] },
          { numero: '03', titulo: 'Número de Obstrução', conteudo: ['Identificação de bloqueios recorrentes a partir do mapa numerológico.'] },
          { numero: '04', titulo: 'Prosperidade', conteudo: ['Leitura de padrões numéricos ligados a dinheiro e realização material.'] },
          { numero: '05', titulo: 'Práticas e Exercícios', conteudo: ['Estudos de caso e prática supervisionada em cima de mapas reais.'] },
          { numero: '06', titulo: 'Hierarquia e Hemisférios NPS', conteudo: ['Aprofundamento da metodologia NPS aplicada ao atendimento.'] },
        ]}
        faqItems={[
          { q: 'Preciso já ter feito o NPA antes da Mentoria NPS?', a: 'Sim — a Mentoria NPS parte do que você já aprendeu no NPA (Numerologia Pitagórica Aplicada) e aprofunda com prática ao vivo. Não é curso introdutório.' },
          { q: 'Os mapas numerológicos (Mapa 7 Esferas) são meus ou dos meus clientes?', a: 'Você pode usar as 8 leituras mensais pra praticar com seus próprios clientes/casos reais — é o mesmo material que você vai entregar no seu atendimento.' },
          { q: 'É assinatura mensal ou pagamento único?', a: 'É mensalidade — o acesso aos encontros, gravações e mapas continua enquanto a mensalidade estiver em dia.' },
          { q: 'Posso cancelar quando quiser?', a: 'Sim, não há fidelidade. Fale com a equipe pelo WhatsApp pra ajustar ou cancelar sua mensalidade.' },
        ]}
      />

      <SiteFooter />
    </div>
  )
}
