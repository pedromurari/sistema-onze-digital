'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'
import { sendPasswordReset } from '@/lib/actions/auth'

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordInput) {
    setLoading(true)
    setServerError(null)
    const fd = new FormData()
    fd.append('email', data.email)
    const result = await sendPasswordReset(fd)
    setLoading(false)
    if (result?.error) setServerError(result.error)
    if (result?.success) setSuccess(result.success)
  }

  if (success) {
    return (
      <div className="space-y-5 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.25)' }}>
          <Mail className="w-7 h-7" style={{ color: '#FFB800' }} />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#1a2430]" style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
            E-mail enviado!
          </h2>
          <p className="text-sm text-[#5f6b78]">{success}</p>
        </div>
        <Link href="/login" className="block text-sm font-semibold hover:underline" style={{ color: '#FFB800' }}>
          Voltar ao login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="space-y-1.5">
        <h1 className="text-[26px] font-bold text-[#1a2430] leading-tight"
          style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
          Recuperar senha
        </h1>
        <p className="text-base text-[#5f6b78]">
          Enviaremos um link para redefinir sua senha.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-bold text-[#1a2430] block">E-mail</label>
          <input
            id="email" type="email" placeholder="seu@email.com" autoComplete="email"
            className="w-full h-12 px-4 rounded-2xl text-[#1a2430] text-[15px] outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(23,36,50,0.1)' }}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
        </div>

        {serverError && (
          <div className="text-sm text-center py-2.5 px-4 rounded-xl bg-red-50 text-red-600 border border-red-100">
            {serverError}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full h-12 rounded-2xl text-[15px] font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0a0a0a', boxShadow: '0 8px 24px rgba(255,184,0,0.25)' }}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-[#0a0a0a]" /> : 'Enviar link de redefinição'}
        </button>
      </form>

      <Link href="/login"
        className="flex items-center gap-1.5 text-sm font-medium hover:underline transition-colors text-[#5f6b78] hover:text-[#1a2430]">
        <ArrowLeft className="w-4 h-4" />
        Voltar ao login
      </Link>
    </div>
  )
}
