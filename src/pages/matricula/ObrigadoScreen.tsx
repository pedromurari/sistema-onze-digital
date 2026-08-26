/**
 * Tela de sucesso — markup copiado quase 1:1 de `#success-screen` /
 * `.obrigado-*` da referência.
 */
export function ObrigadoScreen({ nome }: { nome: string }) {
  const primeiroNome = nome.trim().split(/\s+/)[0] || nome;
  return (
    <div className="idm-matricula">
      <div id="success-screen" className="show">
        <div className="obrigado-wrap">

          <div className="obrigado-seal">
            <span className="obrigado-check">✓</span>
          </div>

          <p className="obrigado-eyebrow">Matrícula confirmada</p>

          <h2 className="obrigado-title">Obrigado, {primeiroNome}!</h2>
          <p className="obrigado-instituto">Seja muito bem-vindo(a) ao<br />Instituto Despertamente</p>

          <div className="obrigado-rule"></div>

          <div className="obrigado-card">
            <p>
              Sua matrícula foi registrada com sucesso.<br /><br />
              Em breve você receberá <strong>todas as informações de acesso
              e próximos passos pelo WhatsApp.</strong><br /><br />
              Fique de olho nas mensagens — mal podemos esperar para começar essa jornada com você. 🌟
            </p>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'rgba(245,240,228,0.4)', marginTop: 'var(--space-2)' }}>
            Dúvidas? Entre em contato com nossa equipe.
          </p>

          <div className="obrigado-footer-note">Instituto Despertamente · IDM · Todos os direitos reservados</div>

        </div>
      </div>
    </div>
  );
}
