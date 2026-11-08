import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const FRANQUIA_HOSTS = ['idmpsifranquia.com.br', 'idmpsifranquia.com', 'www.idmpsifranquia.com.br', 'www.idmpsifranquia.com']

// Domínios próprios de parceiras que devem mostrar uma página específica
// do site, sem precisar mexer em rota nem redirecionar visivelmente a URL.
const DOMINIOS_PARCEIRAS: Record<string, string> = {
  'links.jocimaraanjos.com.br': '/jocimara-anjos',
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.replace(/:\d+$/, '') || ''

  const destinoParceira = DOMINIOS_PARCEIRAS[host]
  if (destinoParceira && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = destinoParceira
    return NextResponse.rewrite(url)
  }

  if (FRANQUIA_HOSTS.includes(host)) {
    const { pathname } = request.nextUrl

    if (pathname.startsWith('/franquia-assets/') || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/google')) {
      return NextResponse.next()
    }

    if (pathname === '/privacidade.html' || pathname === '/privacidade') {
      const url = request.nextUrl.clone()
      url.pathname = '/franquia-privacidade.html'
      return NextResponse.rewrite(url)
    }

    if (pathname === '/termos.html' || pathname === '/termos') {
      const url = request.nextUrl.clone()
      url.pathname = '/franquia-termos.html'
      return NextResponse.rewrite(url)
    }

    if (pathname !== '/franquia') {
      const url = request.nextUrl.clone()
      url.pathname = '/franquia'
      return NextResponse.rewrite(url)
    }

    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|google.*\\.html|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
