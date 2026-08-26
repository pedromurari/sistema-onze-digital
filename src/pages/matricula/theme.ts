/**
 * Suporte visual da ficha de matrícula pública (/matricula/:vendedor).
 *
 * O visual em si vem quase 1:1 de `matricula-reference.css` (extraído do
 * <style> da página oficial em produção, idmpsi.com.br/matricula.html, e
 * escopado sob a classe `.idm-matricula` — ver esse arquivo para o
 * processo). Este módulo só cuida de carregar a fonte Google (Poppins),
 * que a referência também carrega via <link>.
 */

/** Injeta a Google Font Poppins (mesma da referência) uma única vez por sessão de navegação. */
export function ensurePoppinsFontLoaded() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('matricula-poppins-font')) return;

  const preconnect1 = document.createElement('link');
  preconnect1.rel = 'preconnect';
  preconnect1.href = 'https://fonts.googleapis.com';

  const preconnect2 = document.createElement('link');
  preconnect2.rel = 'preconnect';
  preconnect2.href = 'https://fonts.gstatic.com';
  preconnect2.crossOrigin = 'anonymous';

  const stylesheet = document.createElement('link');
  stylesheet.id = 'matricula-poppins-font';
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';

  document.head.appendChild(preconnect1);
  document.head.appendChild(preconnect2);
  document.head.appendChild(stylesheet);
}
