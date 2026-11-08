'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'
import { signIn } from '@/lib/actions/auth'

export function LoginForm({ next }: { next?: string }) {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setServerError(null)
    const fd = new FormData()
    fd.append('email', data.email)
    fd.append('password', data.password)
    if (next) fd.append('next', next)
    const result = await signIn(fd)
    if (result?.error) {
      setServerError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="space-y-1.5">
        <h1 className="text-[26px] font-bold text-[#1a2430] leading-tight"
          style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
          Bem-vindo de volta
        </h1>
        <p className="text-base text-[#5f6b78]">Acesse sua área de aprendizado</p>
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-bold text-[#1a2430] block">Senha</label>
            <Link href="/forgot-password" className="text-sm font-semibold hover:underline" style={{ color: '#FFB800' }}>
              Esqueceu?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password" type={showPassword ? 'text' : 'password'}
              placeholder="••••••••" autoComplete="current-password"
              className="w-full h-12 px-4 pr-12 rounded-2xl text-[#1a2430] text-[15px] outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(23,36,50,0.1)' }}
              {...register('password')}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5f6b78] hover:text-[#1a2430] transition-colors">
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
        </div>

        {serverError && (
          <div className="text-sm text-center py-2.5 px-4 rounded-xl bg-red-50 text-red-600 border border-red-100">
            {serverError}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full h-12 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #1a2430, #2d3f52)', boxShadow: '0 8px 24px rgba(23,36,50,0.2)' }}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar na plataforma'}
        </button>
      </form>

      <p className="text-center text-base text-[#5f6b78]">
        Não tem conta?{' '}
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
          className="font-bold hover:underline" style={{ color: '#FFB800' }}
        >
          Criar conta gratuita
        </Link>
      </p>
    </div>
  )
}
