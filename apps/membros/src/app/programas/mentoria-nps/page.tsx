import { createClient } from '@/lib/supabase/server'
import { NavbarComecar } from '@/app/comecar/NavbarComecar'
import { WhatsAppButton } from '@/app/comecar/WhatsAppButton'
import { StickyCTA } from '@/app/comecar/StickyCTA'
import { CookieBanner } from '@/app/comecar/CookieBanner'
import { ProgramaContent, type ProductData } from '@/components/marketing/ProgramaContent'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SchemaCurso } from '@/components/marketing/SchemaCurso'

const PRODUCT_SLUG = 'mentoria-nps'

export const metadata = {
  title: 'Mentoria NPS — Numerologia Pitagórica',
  description: 'Dois encontros ao vivo por mês, mapas numerológicos (Mapa 7 Esferas) e acompanhamento contínuo pra você aplicar a Numerologia Pitagórica de verdade.',
  alternates: { canonical: '/programas/mentoria-nps' },
  openGraph: {
    url: '/programas/mentoria-nps',
    type: 'website',
    title: 'Mentoria NPS',
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
      <SchemaCurso
        slug={PRODUCT_SLUG}
        preco={product?.price ?? null}
        assinatura={product?.payment_type === 'subscription'}
      />

      <ProgramaContent
        product={product}
        // Assinatura não passa pela vendedora: vai direto pra ficha do NPS
        // (PIX SyncPay -> acesso à área de membros + boas-vindas com o grupo).
        checkoutUrlFixo="https://sistema.idmpsi.com.br/matricula/nps"
        // Black IDM (24/11/2026): 1ª mensalidade pela metade, o IDM paga a
        // outra metade. O valor de verdade é cobrado pelo nps-matricula-criar
        // (BLACK_NPS_ATE) -- se mudar aqui, mudar lá.
        oferta={{ rotulo: 'Black IDM · 1º mês pela metade', primeira: 50, nota: 'Na Black Friday, o IDM paga metade da sua primeira mensalidade. Condição válida só até 30 de novembro; depois, a primeira mensalidade volta a ser R$ 100.' }}
        faixas={[
          ['Black Friday na Mentoria NPS', '1º mês por R$ 50', 'Só até 30 de novembro', 'O IDM paga metade pra você', 'Aberta pra todos', 'Bônus: curso NPA gravado'],
          ['Encontros ao vivo com Rodrygo Murari', 'Plataforma do Mapa 7 Esferas', 'Até 8 mapas por mês', 'Um tema novo a cada encontro', 'Gravações na área de membros', '1º mês por R$ 50 até 30/11'],
        ]}
        waMessage="Olá! Tenho interesse na Mentoria NPS (Numerologia Pitagórica)."
        eyebrow="Instituto Despertamente · Aperfeiçoamento contínuo"
        titulo={['Mentoria', 'NPS.']}
        tagline="Numerologia Pitagórica em aperfeiçoamento contínuo: encontros ao vivo com Rodrygo Murari, um tema diferente a cada vez, pra você virar referência na sua leitura."
        statsLine="2 encontros ao vivo / mês · Mapa 7 Esferas incluso"
        manifesto={<>
          A Numerologia Pitagórica não é tabela pronta — é <span className="text-[#c8c8c8]">leitura de padrão em movimento</span>.
          A Mentoria NPS é um intensivo que não acaba: a cada encontro, um tema diferente, intercalando destino,
          prosperidade, bloqueios e estudo de caso. Você tira dúvida real de atendimento real e recebe mapas
          numerológicos (Mapa 7 Esferas) todo mês pra praticar em cima de caso de verdade,
          <span className="text-[#c8c8c8]"> não de exercício teórico.</span>
        </>}
        incluso={[
          'Dois encontros ao vivo por mês com Rodrygo Murari',
          'Gravação de todos os encontros, disponível na plataforma',
          'Até 8 mapas numerológicos (Mapa 7 Esferas) por mês, enquanto a mensalidade estiver em dia',
          'Material de apoio e grupo de prática entre mentorias',
          'Bônus: o curso NPA (Numerologia Pitagórica Aplicada) completo, gravado na área de membros',
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
          { q: 'Preciso ter feito o NPA antes?', a: 'Não. A Mentoria NPS é aberta pra todos: quem já fez o NPA aprofunda, e quem está começando aprende nos encontros ao vivo e nas gravações.' },
          { q: 'Como funciona a promoção de Black Friday?', a: 'Quem entra durante a Black IDM paga só R$ 50 na primeira mensalidade, porque o IDM paga a outra metade. A partir do segundo mês, a mensalidade é R$ 100, sem fidelidade. A condição vale até 30 de novembro; depois disso, volta ao valor normal.' },
          { q: 'Os mapas numerológicos (Mapa 7 Esferas) são meus ou dos meus clientes?', a: 'Você pode usar as 8 leituras mensais pra praticar com seus próprios clientes/casos reais — é o mesmo material que você vai entregar no seu atendimento.' },
          { q: 'O que muda de um encontro pro outro?', a: 'Cada encontro traz um tema diferente: destino, imagem, obstrução, prosperidade, hemisférios, estudo de caso. Os temas se intercalam, então a mentoria funciona como um aperfeiçoamento contínuo, e não como um curso com começo e fim.' },
          { q: 'Ganho o curso NPA junto?', a: 'Sim. Quem assina a Mentoria NPS recebe de bônus o curso NPA gravado, na área de membros, pra estudar a base no seu ritmo.' },
          { q: 'É assinatura mensal ou pagamento único?', a: 'É mensalidade — o acesso aos encontros, gravações e mapas continua enquanto a mensalidade estiver em dia.' },
          { q: 'Posso cancelar quando quiser?', a: 'Sim, não há fidelidade. Fale com a equipe pelo WhatsApp pra ajustar ou cancelar sua mensalidade.' },
        ]}
      />

      <SiteFooter />
    </div>
  )
}
