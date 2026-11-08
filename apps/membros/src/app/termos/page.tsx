import Link from 'next/link'
import Image from 'next/image'
import { VoltarLink } from '@/components/marketing/VoltarLink'

export const metadata = {
  title: 'Termos de Uso — Instituto Despertamente',
  description: 'Termos e condições de uso da plataforma Instituto Despertamente.',
}

const LAST_UPDATED = '08 de junho de 2025'

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0f0f0]">

      {/* Simple header */}
      <header className="border-b border-white/5 bg-[#080808]/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 sm:px-10 h-14 flex items-center justify-between">
          <Link href="/comecar" className="flex items-center gap-2.5">
            <Image src="/despertamente-simbolo-branco.png" alt="IDM" width={24} height={24} className="object-contain" />
            <span style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-sm font-bold text-[#f0f0f0]">
              Instituto <span className="text-[#FFB800]">Despertamente</span>
            </span>
          </Link>
          <VoltarLink className="text-xs text-[#606060] hover:text-[#a0a0a0] transition-colors">
            ← Voltar
          </VoltarLink>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-16 space-y-10">

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-[#FFB800]">Legal</p>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif" }} className="text-3xl sm:text-4xl font-bold">
            Termos de Uso
          </h1>
          <p className="text-sm text-[#606060]">Última atualização: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-sm text-[#a0a0a0] leading-relaxed">

          <Section title="1. Definições">
            <p>
              Para os fins destes Termos de Uso, consideram-se:
            </p>
            <ul>
              <li><strong className="text-[#f0f0f0]">IDM / Plataforma:</strong> Instituto Despertamente e seus serviços digitais.</li>
              <li><strong className="text-[#f0f0f0]">Usuário / Aluno:</strong> pessoa física que acessa ou usa a plataforma.</li>
              <li><strong className="text-[#f0f0f0]">Conteúdo:</strong> aulas, materiais, lives, downloads e demais recursos disponibilizados.</li>
              <li><strong className="text-[#f0f0f0]">Conta:</strong> credenciais de acesso individuais à plataforma.</li>
            </ul>
          </Section>

          <Section title="2. Aceitação dos Termos">
            <p>
              Ao criar uma conta ou acessar a plataforma, você declara que leu, compreendeu e concorda com estes
              Termos de Uso e com nossa{' '}
              <Link href="/privacidade" className="text-[#FFB800] hover:underline">Política de Privacidade</Link>.
              Caso não concorde, não utilize a plataforma.
            </p>
          </Section>

          <Section title="3. Cadastro e conta">
            <p>
              Para acessar os conteúdos, você deve criar uma conta com informações verdadeiras e atualizadas.
              Você é responsável pela confidencialidade das suas credenciais e por todas as atividades realizadas
              com sua conta. Em caso de uso não autorizado, notifique imediatamente o IDM.
            </p>
            <p>
              O cadastro inicial é gratuito. Determinados cursos e programas podem exigir pagamento para acesso
              completo.
            </p>
          </Section>

          <Section title="4. Uso da plataforma">
            <p>Você concorda em não:</p>
            <ul>
              <li>Compartilhar suas credenciais de acesso com terceiros.</li>
              <li>Copiar, distribuir, reproduzir ou revender qualquer conteúdo da plataforma.</li>
              <li>Usar a plataforma para fins ilegais ou que violem direitos de terceiros.</li>
              <li>Realizar engenharia reversa, scraping ou acesso automatizado não autorizado.</li>
              <li>Publicar conteúdo ofensivo, discriminatório ou que viole a legislação brasileira.</li>
            </ul>
          </Section>

          <Section title="5. Propriedade intelectual">
            <p>
              Todo o conteúdo disponível na plataforma — incluindo textos, vídeos, áudios, materiais, marca,
              logotipo e metodologia — é de propriedade exclusiva do Instituto Despertamente ou licenciado
              a ele, sendo protegido pela Lei de Direitos Autorais (Lei nº 9.610/1998).
            </p>
            <p>
              O acesso ao conteúdo não transfere ao usuário nenhum direito de propriedade intelectual.
              É permitido o uso pessoal e não comercial para fins de aprendizado.
            </p>
          </Section>

          <Section title="6. Pagamentos">
            <p>
              Os valores dos programas são informados na página de cada produto antes da finalização da compra.
              Aceitamos cartão de crédito (parcelado em até 12x) e Pix (com desconto à vista, quando aplicável).
            </p>
            <p>
              O acesso ao conteúdo pago é liberado após a confirmação do pagamento. Em caso de pagamento por Pix,
              o acesso é liberado em até 30 minutos após a confirmação.
            </p>
          </Section>

          <Section title="7. Política de reembolso — Garantia de 7 dias">
            <p>
              Oferecemos <strong className="text-[#f0f0f0]">garantia incondicional de 7 (sete) dias corridos</strong> a partir da data
              de compra para todos os programas pagos.
            </p>
            <p>
              Se por qualquer motivo você não estiver satisfeito, basta solicitar o reembolso no prazo de 7 dias
              pelo e-mail{' '}
              <a href="mailto:suporte@institutodespertamente.com.br" className="text-[#FFB800] hover:underline">
                suporte@institutodespertamente.com.br
              </a>{' '}
              ou via WhatsApp. O reembolso será processado em até 10 dias úteis para cartão de crédito ou 3 dias
              úteis para Pix.
            </p>
            <p>
              Após o período de 7 dias, não realizamos reembolsos, exceto nas hipóteses previstas no Código de
              Defesa do Consumidor (Lei nº 8.078/1990).
            </p>
          </Section>

          <Section title="8. Disponibilidade do serviço">
            <p>
              O IDM se compromete a manter a plataforma disponível 24h/7 dias, mas não garante disponibilidade
              ininterrupta. Manutenções programadas serão comunicadas com antecedência. Eventos de força maior
              que causem indisponibilidade não geram direito a reembolso proporcional.
            </p>
          </Section>

          <Section title="9. Limitação de responsabilidade">
            <p>
              O IDM não se responsabiliza por resultados específicos obtidos pelo usuário. Os programas oferecem
              conhecimento e metodologia para desenvolvimento pessoal; a aplicação e os resultados dependem
              exclusivamente do comprometimento e esforço individual de cada aluno.
            </p>
            <p>
              As certificações emitidas pelo IDM são credenciais complementares e não substituem graduações
              ou especializações regulamentadas pelo MEC para o exercício de profissões regulamentadas.
            </p>
          </Section>

          <Section title="10. Suspensão e encerramento de conta">
            <p>
              O IDM pode suspender ou encerrar uma conta em caso de violação destes Termos, uso fraudulento
              ou comportamento que prejudique outros usuários ou a plataforma. Nesses casos, não haverá
              reembolso de valores pagos.
            </p>
            <p>
              O usuário pode encerrar sua conta a qualquer momento mediante solicitação ao suporte.
            </p>
          </Section>

          <Section title="11. Modificações">
            <p>
              O IDM pode modificar estes Termos a qualquer momento. Alterações significativas serão comunicadas
              por e-mail com antecedência de 15 dias. O uso continuado da plataforma após esse prazo constitui
              aceitação dos novos termos.
            </p>
          </Section>

          <Section title="12. Legislação e foro">
            <p>
              Estes Termos são regidos pela legislação brasileira. Para resolução de conflitos, fica eleito
              o Foro da Comarca de São Paulo/SP, com renúncia expressa a qualquer outro, por mais
              privilegiado que seja.
            </p>
          </Section>

          <Section title="13. Contato">
            <p>
              Em caso de dúvidas sobre estes Termos:{' '}
              <a href="mailto:suporte@institutodespertamente.com.br" className="text-[#FFB800] hover:underline">
                suporte@institutodespertamente.com.br
              </a>
            </p>
          </Section>
        </div>

        <div className="pt-4 border-t border-white/5 flex gap-4 text-xs">
          <Link href="/privacidade" className="text-[#606060] hover:text-[#a0a0a0] transition-colors">
            Política de Privacidade
          </Link>
          <VoltarLink className="text-[#606060] hover:text-[#a0a0a0] transition-colors">
            ← Voltar ao site
          </VoltarLink>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2
        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        className="text-lg font-bold text-[#f0f0f0]"
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm text-[#a0a0a0] leading-relaxed [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
