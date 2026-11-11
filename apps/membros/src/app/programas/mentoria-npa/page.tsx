import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ProgramaContent, type ProductData } from '@/components/marketing/ProgramaContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'

const PRODUCT_SLUG = 'mentoria-npa'

export const metadata = {
  title: 'Mentoria NPA — Numerologia Pitagórica Aplicada — Instituto Despertamente',
  description: 'Acesso ao grupo da mentoria, ao curso gravado do NPA e ao material de apoio — a metodologia exclusiva do IDM de leitura de padrões numéricos.',
  openGraph: {
    title: 'Mentoria NPA — Instituto Despertamente',
    description: 'A metodologia exclusiva do IDM de Numerologia Pitagórica Aplicada, com grupo de mentoria.',
  },
}

export default async function MentoriaNpaPage() {
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
        waMessage="Olá! Tenho interesse na Mentoria NPA (Numerologia Pitagórica Aplicada)."
        eyebrow="Instituto Despertamente · Mentoria + curso gravado"
        titulo={['Mentoria', 'NPA.']}
        tagline="A metodologia exclusiva do IDM de Numerologia Pitagórica Aplicada — o número da alma, da imagem e os padrões que seu nome e data de nascimento revelam."
        statsLine="Curso gravado + grupo de mentoria · Acesso imediato"
        manifesto={<>
          Nome e data de nascimento carregam um padrão numérico que se repete na forma como você pensa,
          se relaciona e escolhe. <span className="text-[#c8c8c8]">O NPA ensina a ler esse padrão</span> —
          não como previsão, mas como ferramenta de autoconhecimento e, pra quem quer atender,
          <span className="text-[#c8c8c8]"> como metodologia de trabalho com outras pessoas.</span>
        </>}
        incluso={[
          'Acesso ao grupo de mentoria com a equipe do IDM',
          'Curso gravado completo de NPA, no seu ritmo',
          'Material de apoio pra aplicar a leitura em você e em outras pessoas',
          'Atualizações do curso incluídas, sem custo adicional',
        ]}
        modulos={[
          { numero: '00', titulo: 'Boas-Vindas', conteudo: ['Como a plataforma funciona e o caminho sugerido pelo curso.'] },
          { numero: '01', titulo: 'Número da Alma', conteudo: ['O que motiva você por dentro — o número calculado a partir do seu nome completo.'] },
          { numero: '02', titulo: 'Número da Imagem', conteudo: ['Como você é percebido por fora, e onde isso pode conflitar com o Número da Alma.'] },
        ]}
        faqItems={[
          { q: 'Preciso saber matemática ou ter formação anterior?', a: 'Não. O NPA ensina o cálculo passo a passo — qualquer pessoa consegue acompanhar, mesmo sem nenhuma base em numerologia.' },
          { q: 'É só pra uso pessoal ou posso atender outras pessoas?', a: 'As duas coisas. Muita gente começa aplicando em si e na família, e depois usa a mesma leitura em atendimento — a Mentoria NPS é o passo seguinte pra quem quer profissionalizar isso.' },
          { q: 'O curso gravado fica disponível pra sempre?', a: 'Sim, enquanto você tiver acesso ativo à mentoria você pode rever as aulas quantas vezes quiser.' },
          { q: 'Tem garantia?', a: 'Garantia de 7 dias — se não fizer sentido pra você, devolvemos o valor.' },
        ]}
      />

      <SiteFooter />
    </div>
  )
}
