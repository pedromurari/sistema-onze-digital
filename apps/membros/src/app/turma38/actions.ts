'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createHmac } from 'crypto'

function buildLoginUrl(email: string, nome: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000)
  const sig = createHmac('sha256', secret).update(`${email}:${ts}`).digest('hex')
  const e = Buffer.from(email).toString('base64url')
  const n = Buffer.from(nome).toString('base64url')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return `${siteUrl}/api/auto-login?e=${e}&t=${ts}&s=${sig}&n=${n}`
}

export async function registrarLead(nome: string, email: string): Promise<string> {
  const secret = process.env.CRIAR_USUARIO_API_KEY
  if (!secret) throw new Error('Configuração ausente')

  const supabase = createAdminClient()

  // Tenta criar o usuário; se já existe, ignora o erro e gera o link mesmo assim
  await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: 'idm2026',
    email_confirm: true,
    user_metadata: { full_name: nome.trim() },
  })

  return buildLoginUrl(email.trim().toLowerCase(), nome.trim(), secret)
}
