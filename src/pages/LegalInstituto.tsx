/**
 * LegalInstituto.tsx
 * Pagina publica institucional: Politica de Privacidade + Termos de Uso,
 * genericas pro Instituto Despertamente -- usadas pelo rodape do checkout
 * publico (/comprar/:produtoId) e qualquer outra pagina publica que
 * precise linkar essas politicas.
 *
 * IMPORTANTE: rascunho de conteudo generico (LGPD), escrito pra dar
 * transparencia real ao titular dos dados -- nao e' assessoria juridica.
 * Pedido pelo Pedro 13/11/2026; revisar com advogado antes de tratar como
 * definitivo, especialmente a clausula de reembolso/cancelamento, que
 * varia por produto/parceiro.
 */
import './matricula/matricula-reference.css';

const IDM_LOGO = 'https://turma47.semanadodespertar.online/lovable-uploads/1b0d4a56-e01f-4ce0-b2f7-0eecf33da536.png';

export default function LegalInstituto() {
  return (
    <div className="idm-matricula">
      <div className="pay-header">
        <img src={IDM_LOGO} alt="Instituto Despertamente" style={{ height: 36, margin: '0 auto var(--space-4)', display: 'block' }} loading="lazy" />
        <div className="pay-header-badge">Instituto Despertamente</div>
        <h2 className="pay-header-title">Política de Privacidade e Termos de Uso</h2>
      </div>

      <div className="pay-body" style={{ maxWidth: 760 }}>
        <section id="privacidade" style={{ marginBottom: 'var(--space-16)' }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', color: 'var(--navy)', marginBottom: 'var(--space-4)' }}>
            Política de Privacidade
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
            Última atualização: 13 de novembro de 2026.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.7 }}>
            <p>
              Esta política explica como o <strong>Instituto Despertamente / Grupo Despertamente</strong>
              {' '}(CNPJ 55.184.481/0001-24) trata os dados pessoais de quem usa nossas páginas de
              cadastro e pagamento, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
            </p>

            <div>
              <strong>Quais dados coletamos</strong>
              <p>Nome completo, e-mail, WhatsApp e, quando o pagamento é por cartão, o CPF informado para a cobrança.</p>
            </div>

            <div>
              <strong>O que NÃO coletamos nem armazenamos</strong>
              <p>
                Número de cartão de crédito, código de segurança (CVV) ou qualquer outro dado sensível de
                pagamento. Esses dados são digitados diretamente num formulário seguro do{' '}
                <strong>Mercado Pago</strong> (processador de pagamentos), que já é certificado PCI-DSS
                para lidar com esse tipo de informação — eles nunca passam pelos nossos servidores.
              </p>
            </div>

            <div>
              <strong>Para que usamos seus dados</strong>
              <ul style={{ margin: '4px 0 0 18px' }}>
                <li>Processar o pagamento e confirmar a compra;</li>
                <li>Entrar em contato (e-mail/WhatsApp) sobre o produto ou serviço contratado;</li>
                <li>Cumprir obrigações fiscais e legais.</li>
              </ul>
            </div>

            <div>
              <strong>Com quem compartilhamos</strong>
              <p>
                Com o <strong>Mercado Pago</strong>, para processar o pagamento, e com o(a) profissional ou
                parceiro(a) associado(a) ao produto/serviço contratado, apenas o necessário para a prestação
                do serviço (ex.: nome e contato pra agendar o atendimento). Não vendemos nem repassamos
                dados pra fins de marketing de terceiros.
              </p>
            </div>

            <div>
              <strong>Seus direitos</strong>
              <p>
                Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento, escrevendo
                para <strong>contato@institutodespertamente.com.br</strong>.
              </p>
            </div>

            <div>
              <strong>Segurança</strong>
              <p>
                Toda a comunicação com nossas páginas é criptografada (HTTPS/TLS). Os dados que armazenamos
                ficam num banco de dados com controle de acesso por linha (RLS), acessível apenas por
                sistemas internos autorizados — nunca diretamente pelo navegador de quem visita o site.
              </p>
            </div>
          </div>
        </section>

        <section id="termos">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', color: 'var(--navy)', marginBottom: 'var(--space-4)' }}>
            Termos de Uso
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.7 }}>
            <div>
              <strong>Sobre o serviço</strong>
              <p>
                Estas páginas de pagamento são operadas pelo Instituto Despertamente para viabilizar a
                contratação de produtos e serviços oferecidos por profissionais e parceiros associados.
                O Instituto atua como intermediário do pagamento (split automático via Mercado Pago) — a
                prestação do serviço em si é de responsabilidade do(a) profissional/parceiro(a) indicado(a).
              </p>
            </div>

            <div>
              <strong>Pagamento</strong>
              <p>
                Os pagamentos são processados pelo Mercado Pago, via cartão de crédito ou Pix. Ao confirmar
                o pagamento, você concorda com os termos de uso do próprio Mercado Pago para o processamento
                da transação.
              </p>
            </div>

            <div>
              <strong>Cancelamento e reembolso</strong>
              <p>
                As condições de remarcação, cancelamento e reembolso são as informadas no momento da
                contratação de cada produto/serviço específico. Em caso de dúvida, entre em contato pelo
                canal informado na confirmação da compra.
              </p>
            </div>

            <div>
              <strong>Contato</strong>
              <p>contato@institutodespertamente.com.br</p>
            </div>
          </div>
        </section>
      </div>

      <div className="site-footer">
        <p className="footer-logo">Instituto Despertamente</p>
        <div className="footer-rule" />
        <p className="footer-note">CNPJ 55.184.481/0001-24</p>
      </div>
    </div>
  );
}
