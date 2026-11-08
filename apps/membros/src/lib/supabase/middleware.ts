import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isAuthRoute = pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password')

  const isMemberRoute = pathname.startsWith('/dashboard') ||
    pathname.startsWith('/cursos') ||
    pathname.startsWith('/perfil') ||
    pathname.startsWith('/certificados') ||
    pathname.startsWith('/ao-vivo') ||
    pathname.startsWith('/aula') ||
    pathname.startsWith('/formacao') ||
    pathname.startsWith('/mentoria-npa') ||
    pathname.startsWith('/mentoria-nps')

  const isAdminRoute = pathname.startsWith('/admin')
  const isProtected = isMemberRoute || isAdminRoute

  // Não autenticado → login, lembrando pra onde voltar depois
  if (!user && isProtected) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // Autenticado em rota de auth → dashboard (admin acessa /admin pelo menu quando quiser)
  // /reset-password precisa abrir logado: o link do e-mail de recuperação já cria a sessão.
  if (user && isAuthRoute && !pathname.startsWith('/reset-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Aluno tentando acessar /admin → redireciona para /dashboard
  if (user && isAdminRoute) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
