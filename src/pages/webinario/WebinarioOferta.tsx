import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { carregarPixel, trackPixel } from './meta-pixel';
import './webinario.css';

// Direciona pra conversa com a vendedora (Helen) via WhatsApp -- NÃO pro
// checkout direto (/matricula/helen). Pedido explícito 12/11/2026: matrícula
// self-service logo depois do pitch de um webinário frio é rara de
// acontecer de verdade; o caminho certo é um humano conduzindo a conversa
// antes de qualquer cobrança. O link de checkout self-service continua
// existindo (usado noutros fluxos, ex: Black Friday com condição já fechada),
// só não é mais o botão padrão aqui.
const HELEN_WHATSAPP = '5511965781940';

export default function WebinarioOferta() {
  const nome = sessionStorage.getItem('webinario_nome') || '';

  useEffect(() => {
    carregarPixel();
    trackPixel('ViewContent', { content_name: 'Oferta — Formação em Psicanálise', content_category: 'Webinario' });
  }, []);

  const falarComVendedora = () => {
    trackPixel('Contact', { content_name: 'Formação em Psicanálise Clínica Integrativa' });
    const primeiroNome = nome.trim().split(/\s+/)[0] || '';
    const mensagem = primeiroNome
      ? `Oi! Sou ${primeiroNome}, acabei de assistir ao webinário e quero saber as condições da Formação em Psicanálise Clínica Integrativa.`
      : 'Oi! Acabei de assistir ao webinário e quero saber as condições da Formação em Psicanálise Clínica Integrativa.';
    window.open(`https://wa.me/${HELEN_WHATSAPP}?text=${encodeURIComponent(mensagem)}`, '_blank');
  };

  return (
    <div className="idm-webinario">
      <div className="iw-wrap iw-wrap-center">
        <div className="iw-logo">INSTITUTO DESPERTAMENTE</div>
        <h1 className="iw-h1">🚨 Matrículas abertas</h1>
        <p className="iw-sub">
          Formação em Psicanálise Clínica Integrativa — a mesma formação que você acabou
          de conhecer no webinário, com condição especial por tempo limitado.
        </p>
        <div className="iw-card">
          <Button className="iw-btn-gold w-full" onClick={falarComVendedora}>
            FALAR COM NOSSA CONSULTORA
          </Button>
        </div>
      </div>
    </div>
  );
}
