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
  title: 'Mentoria NPS — Numerologia Pitagórica Sistêmica',
  description: 'Mentoria ao vivo toda segunda às 20h com Rodrygo Murari, software do Mapa das Sete Esferas, área de membros e bônus Practitioner em PNL. Assinatura de R$ 100/mês, sem fidelidade.',
  alternates: { canonical: '/programas/mentoria-nps' },
  openGraph: {
    url: '/programas/mentoria-nps',
    type: 'website',
    title: 'Mentoria NPS',
    description: 'Encontros ao vivo toda semana, gravações, software do Mapa das Sete Esferas e bônus Practitioner em PNL.',
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
          ['Black Friday na Mentoria NPS', '1º mês por R$ 50', 'Só até 30 de novembro', 'O IDM paga metade pra você', 'Bônus: Practitioner em PNL', 'Bônus: curso NPA gravado'],
          ['Toda segunda, 20h, ao vivo com Rodrygo Murari', 'Software do Mapa das Sete Esferas', 'Um tema novo a cada encontro', 'Gravações na área de membros', 'Grupo VIP no WhatsApp', '1º mês por R$ 50 até 30/11'],
        ]}
        waMessage="Olá! Tenho interesse na Mentoria NPS (Numerologia Pitagórica Sistêmica)."
        eyebrow="Instituto Despertamente · Aperfeiçoamento contínuo"
        titulo={['Mentoria', 'NPS.']}
        tagline="Numerologia Pitagórica Sistêmica: uma jornada pra aprofundar o mapa, com encontros ao vivo toda semana com Rodrygo Murari, criador do Método NPS."
        statsLine="Ao vivo toda segunda, 20h · Software do Mapa das Sete Esferas"
        manifesto={<>
          O seu mapa não é um ponto final. <span className="text-[#c8c8c8]">É um caminho que se amplia a cada nova leitura.</span>{' '}
          A Mentoria NPS é a continuação dos estudos da Numerologia Pitagórica Sistêmica: amplia a leitura do mapa,
          explora o que chamamos de &ldquo;lado B&rdquo; e traz novas interpretações, um tema diferente a cada encontro,
          <span className="text-[#c8c8c8]"> sem começo e fim fechados.</span>
        </>}
        incluso={[
          'Encontro ao vivo toda segunda-feira, às 20h, pelo Meet, com Rodrygo Murari',
          'Gravação de todos os encontros na área de membros NPS',
          'Software do Mapa das Sete Esferas: você digita nome e data, ele calcula e organiza o mapa, com PDF pra entregar ao cliente',
          'Área de membros com aulas gravadas e materiais sobre posições, números e interpretações',
          'Grupo VIP da turma no WhatsApp, com contato direto com a comunidade e o mentor',
          'Bônus: curso Practitioner em PNL (3 meses, encontros quinzenais, com certificado)',
          'Bônus: o curso NPA completo, gravado na área de membros',
          'Cursos e workshops ao longo do ano: Constelação Familiar, Reiki e chakras, Energia Vital, saúde emocional',
        ]}
        modulos={[
          { numero: '01', titulo: 'Fundamentos e arquitetura do mapa', conteudo: ['As Sete Esferas e a leitura integrada das posições: Alma, Imagem, Expressão, Talento, Destino, Psíquico e Excêntrico.', 'Repetições, ausências, pirâmide numerológica e números mestres 11 e 22.'] },
          { numero: '02', titulo: 'Identidade, emoções e desenvolvimento pessoal', conteudo: ['Impulso emocional, temperamento e o equilíbrio dos hemisférios numerológicos.', 'Iniciação Espiritual: o Código do Eu Interior.'] },
          { numero: '03', titulo: 'Ancestralidade e abordagem sistêmica', conteudo: ['Numerologia da ancestralidade, padrões familiares e memórias sistêmicas.', 'Lições e dívidas cármicas dentro do método.'] },
          { numero: '04', titulo: 'Ciclos e linha do tempo', conteudo: ['Ciclos de vida, pináculos, ano pessoal e momentos de transição.', 'Previsão numerológica NPS.'] },
          { numero: '05', titulo: 'Relacionamentos e vida conjugal', conteudo: ['Afinidades, pontos de tensão e compatibilidade numerológica.'] },
          { numero: '06', titulo: 'Prosperidade, vocação e realização', conteudo: ['Relação com dinheiro, talentos, trabalho e os padrões que travam ou favorecem as conquistas.'] },
          { numero: '07', titulo: 'Espiritualidade, lar e ambiente', conteudo: ['Numerologia do propósito, Numerologia do Lar e a relação entre pessoa e ambiente.'] },
        ]}
        faqItems={[
          { q: 'Preciso ter feito o NPA antes?', a: 'Não. A Mentoria NPS é aberta pra todos: quem já fez o NPA aprofunda, e quem está começando aprende nos encontros ao vivo e nas gravações.' },
          { q: 'Como funciona a promoção de Black Friday?', a: 'Quem entra durante a Black IDM paga só R$ 50 na primeira mensalidade, porque o IDM paga a outra metade. A partir do segundo mês, a mensalidade é R$ 100, sem fidelidade. A condição vale até 30 de novembro; depois disso, volta ao valor normal.' },
          { q: 'Como funciona o software do Mapa das Sete Esferas?', a: 'Você digita o nome completo, o nome de batismo e a data de nascimento, e o sistema faz os cálculos e organiza o mapa. Dá pra usar no seu estudo ou baixar em PDF e entregar a um cliente. A interpretação aprofundada vem dos estudos e da mentoria.' },
          { q: 'Quando são os encontros? E se eu não puder ir?', a: 'Toda segunda-feira, às 20h, ao vivo pelo Meet com Rodrygo Murari. Todos os encontros são gravados e ficam na área de membros, então dá pra assistir depois, no seu ritmo.' },
          { q: 'O que é o bônus de PNL?', a: 'Quem entra no NPS ganha o curso Practitioner em Programação Neurolinguística: três meses, encontros quinzenais e certificado.' },
          { q: 'O que muda de um encontro pro outro?', a: 'Cada encontro traz um tema diferente: arquitetura do mapa, ancestralidade, ciclos, relacionamentos, prosperidade, espiritualidade. Os temas se intercalam, então a mentoria funciona como um aperfeiçoamento contínuo, e não como um curso com começo e fim.' },
          { q: 'Ganho o curso NPA junto?', a: 'Sim. Quem assina a Mentoria NPS recebe de bônus o curso NPA gravado, na área de membros, pra estudar a base no seu ritmo.' },
          { q: 'É assinatura mensal ou pagamento único?', a: 'É assinatura mensal de R$ 100, sem fidelidade e sem permanência mínima. O acesso aos encontros, gravações e benefícios continua enquanto a mensalidade estiver em dia.' },
          { q: 'Posso cancelar quando quiser?', a: 'Sim. Depois do cancelamento as próximas cobranças param e o acesso continua até o fim do período já pago. É só falar com a equipe pelo WhatsApp.' },
        ]}
      />

      <SiteFooter />
    </div>
  )
}
