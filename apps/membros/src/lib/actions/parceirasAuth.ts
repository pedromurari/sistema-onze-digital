'use server'

import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE_NAME = 'parceiras_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 dias

function getSecret() {
  const secret = process.env.PARCEIRAS_PASSWORD
  if (!secret) {
    throw new Error(
      'PARCEIRAS_PASSWORD não configurada — defina essa variável de ambiente (.env.local e Vercel).'
    )
  }
  return secret
}

function getExpectedToken() {
  return createHmac('sha256', getSecret()).update('parceiras-authenticated').digest('hex')
}

export async function verifyParceirasPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!password || password !== getSecret()) {
    return { error: 'Senha incorreta.' }
  }

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, getExpectedToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })

  redirect('/parceiras')
}

export async function isParceirasAuthed(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false

  const expected = getExpectedToken()
  const tokenBuf = Buffer.from(token)
  const expectedBuf = Buffer.from(expected)
  if (tokenBuf.length !== expectedBuf.length) return false

  return timingSafeEqual(tokenBuf, expectedBuf)
}

export async function requireParceirasAuth() {
  if (!(await isParceirasAuthed())) {
    redirect('/parceiras-login')
  }
}

export async function parceirasLogout() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
  redirect('/parceiras-login')
}
