import Link from 'next/link'
import Image from 'next/image'
import { VoltarLink } from '@/components/marketing/VoltarLink'

export const metadata = {
  title: 'Política de Privacidade — Instituto Despertamente',
  description: 'Saiba como o Instituto Despertamente coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.',
}

const LAST_UPDATED = '08 de junho de 2025'

export default function PrivacidadePage() {
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
            Política de Privacidade
          </h1>
          <p className="text-sm text-[#606060]">Última atualização: {LAST_UPDATED}</p>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-[#a0a0a0] leading-relaxed">

          <Section title="1. Sobre esta Política">
            <p>
              O Instituto Despertamente (&ldquo;IDM&rdquo;, &ldquo;nós&rdquo;, &ldquo;nosso&rdquo;) valoriza a privacidade dos seus usuários
              e está comprometido com a proteção dos seus dados pessoais. Esta Política de Privacidade descreve como
              coletamos, usamos, armazenamos e protegemos suas informações, em conformidade com a Lei Geral de
              Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).
            </p>
          </Section>

          <Section title="2. Dados que coletamos">
            <p>Coletamos os seguintes tipos de dados pessoais:</p>
            <ul>
              <li><strong className="text-[#f0f0f0]">Dados de identificação:</strong> nome completo, endereço de e-mail, número de telefone.</li>
              <li><strong className="text-[#f0f0f0]">Dados de conta:</strong> login, senha (armazenada com hash), preferências de perfil.</li>
              <li><strong className="text-[#f0f0f0]">Dados de uso:</strong> páginas acessadas, cursos visualizados, progresso, interações com a plataforma.</li>
              <li><strong className="text-[#f0f0f0]">Dados de pagamento:</strong> processados por gateways de pagamento certificados (PCI-DSS). Não armazenamos dados de cartão.</li>
              <li><strong className="text-[#f0f0f0]">Dados técnicos:</strong> endereço IP, tipo de navegador, sistema operacional, cookies de sessão.</li>
            </ul>
          </Section>

          <Section title="3. Como usamos seus dados">
            <p>Utilizamos seus dados pessoais para:</p>
            <ul>
              <li>Fornecer acesso à plataforma e aos conteúdos contratados.</li>
              <li>Processar pagamentos e gerenciar assinaturas.</li>
              <li>Enviar comunicações relacionadas aos seus cursos e conta.</li>
              <li>Enviar comunicações de marketing, quando você consentiu expressamente.</li>
              <li>Melhorar nossos produtos e a experiência na plataforma.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
            <p>
              <strong className="text-[#f0f0f0]">Base legal:</strong> O tratamento é realizado com base no consentimento (Art. 7º, I), execução de contrato (Art. 7º, V)
              e legítimo interesse (Art. 7º, IX) da LGPD.
            </p>
          </Section>

          <Section title="4. Compartilhamento com terceiros">
            <p>Podemos compartilhar seus dados com:</p>
            <ul>
              <li><strong className="text-[#f0f0f0]">Supabase Inc.:</strong> infraestrutura de banco de dados e autenticação (com criptografia em trânsito e em repouso).</li>
              <li><strong className="text-[#f0f0f0]">Processadores de pagamento:</strong> para finalização de transações financeiras.</li>
              <li><strong className="text-[#f0f0f0]">Serviços de análise:</strong> para entender o comportamento agregado na plataforma.</li>
              <li><strong className="text-[#f0f0f0]">Autoridades competentes:</strong> quando exigido por lei ou ordem judicial.</li>
            </ul>
            <p>Não vendemos dados pessoais a terceiros.</p>
          </Section>

          <Section title="5. Cookies">
            <p>
              Utilizamos cookies técnicos (essenciais para o funcionamento da plataforma) e cookies analíticos
              (para melhorar sua experiência), conforme sua escolha no banner de consentimento.
            </p>
            <p>
              Você pode aceitar ou recusar os cookies não essenciais. A recusa não impede o uso da plataforma,
              mas pode limitar algumas funcionalidades de personalização.
            </p>
          </Section>

          <Section title="6. Período de retenção">
            <p>
              Mantemos seus dados pelo tempo necessário para cumprir as finalidades descritas nesta política,
              observados os prazos legais aplicáveis:
            </p>
            <ul>
              <li>Dados de conta ativa: durante o relacionamento e por 5 anos após o encerramento.</li>
              <li>Dados financeiros: 10 anos (obrigação legal tributária).</li>
              <li>Dados de log: 6 meses.</li>
            </ul>
          </Section>

          <Section title="7. Seus direitos (LGPD — Art. 18)">
            <p>Como titular dos dados, você tem direito a:</p>
            <ul>
              <li>Confirmação da existência de tratamento de seus dados.</li>
              <li>Acesso aos seus dados pessoais.</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários.</li>
              <li>Portabilidade dos dados.</li>
              <li>Eliminação dos dados tratados com base no consentimento.</li>
              <li>Revogação do consentimento a qualquer momento.</li>
              <li>Oposição ao tratamento com base em legítimo interesse.</li>
            </ul>
            <p>
              Para exercer seus direitos, entre em contato pelo e-mail:{' '}
              <a href="mailto:privacidade@institutodespertamente.com.br" className="text-[#FFB800] hover:underline">
                privacidade@institutodespertamente.com.br
              </a>
            </p>
          </Section>

          <Section title="8. Segurança">
            <p>
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso
              não autorizado, perda, destruição ou alteração. Isso inclui criptografia TLS em trânsito,
              criptografia em repouso e controles de acesso baseados em função.
            </p>
          </Section>

          <Section title="9. Contato e encarregado (DPO)">
            <p>
              Em caso de dúvidas sobre esta política ou sobre o tratamento dos seus dados, entre em contato com nosso
              Encarregado de Proteção de Dados:
            </p>
            <ul>
              <li><strong className="text-[#f0f0f0]">E-mail:</strong>{' '}
                <a href="mailto:privacidade@institutodespertamente.com.br" className="text-[#FFB800] hover:underline">
                  privacidade@institutodespertamente.com.br
                </a>
              </li>
              <li><strong className="text-[#f0f0f0]">Prazo de resposta:</strong> até 15 dias úteis.</li>
            </ul>
          </Section>

          <Section title="10. Alterações nesta Política">
            <p>
              Esta política pode ser atualizada periodicamente. Notificaremos sobre mudanças significativas por
              e-mail ou por aviso na plataforma. O uso continuado da plataforma após alterações constitui aceitação
              da versão atualizada.
            </p>
          </Section>
        </div>

        <div className="pt-4 border-t border-white/5 flex gap-4 text-xs">
          <Link href="/termos" className="text-[#606060] hover:text-[#a0a0a0] transition-colors">
            Termos de Uso
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
