import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email')
  const password = formData.get('password')

  if (email === 'admin@idmtools.com' && password === 'demo1234') {
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.set('demo_logged_in', 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24, // 24h
    })
    return response
  }

  return NextResponse.redirect(new URL('/login?error=invalid', request.url))
}
