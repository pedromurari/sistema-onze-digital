'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Só aceita caminhos internos (evita open redirect via ?next=https://...)
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next
  return '/dashboard'
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'E-mail ou senha inválidos.' }

  // Volta pra onde a pessoa estava indo — admins acessam /admin pelo menu quando quiserem
  redirect(safeNext(formData.get('next')))
}

export async function signUp(formData: FormData) {
  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  // Cria já com e-mail confirmado — sem etapa de verificação por e-mail
  const admin = createAdminClient()
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createError) {
    return { error: createError.message.includes('already been registered') || createError.message.includes('already exists')
      ? 'Esse e-mail já está cadastrado.'
      : createError.message }
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) return { error: 'Conta criada, mas houve um erro ao entrar. Tente fazer login.' }

  redirect(safeNext(formData.get('next')))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function sendPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback?next=/reset-password`,
  })

  if (error) return { error: error.message }
  return { success: 'E-mail de redefinição enviado. Verifique sua caixa de entrada.' }
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}
