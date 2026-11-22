import { permanentRedirect } from 'next/navigation'

/**
 * O conteudo desta pagina virou a home (`src/app/page.tsx`). A rota fica de
 * pe como redirecionamento permanente porque ela esta em anuncio, bio de
 * rede social e link que gente ja salvou -- quebrar isso perderia trafego
 * pago. Os componentes da pasta (`NavbarComecar`, `StickyCTA`, etc.)
 * continuam aqui e sao usados por varias paginas.
 */
export default function ComecarRedirect() {
  permanentRedirect('/')
}
