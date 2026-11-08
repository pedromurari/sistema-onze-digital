'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { registerSchema, type RegisterInput } from '@/lib/validations/auth'
import { signUp } from '@/lib/actions/auth'

const inputCls = 'w-full h-12 px-4 rounded-2xl text-[#1a2430] text-[15px] outline-none transition-all'
const inputStyle = { background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(23,36,50,0.1)' }

export function RegisterForm({ next }: { next?: string }) {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(data: RegisterInput) {
    setLoading(true)
    setServerError(null)
    const fd = new FormData()
    fd.append('email', data.email)
    fd.append('password', data.password)
    fd.append('full_name', data.full_name)
    if (next) fd.append('next', next)
    const result = await signUp(fd)
    setLoading(false)
    if (result?.error) setServerError(result.error)
  }

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="space-y-1.5">
        <h1 className="text-[26px] font-bold text-[#1a2430] leading-tight"
          style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
          Criar sua conta
        </h1>
        <p className="text-base text-[#5f6b78]">Junte-se ao Instituto Despertamente</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="full_name" className="text-sm font-bold text-[#1a2430] block">Nome completo</label>
          <input
            id="full_name" type="text" placeholder="Seu nome completo" autoComplete="name"
            className={inputCls} style={inputStyle}
            {...register('full_name')}
          />
          {errors.full_name && <p className="text-sm text-red-500">{errors.full_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-bold text-[#1a2430] block">E-mail</label>
          <input
            id="email" type="email" placeholder="seu@email.com" autoComplete="email"
            className={inputCls} style={inputStyle}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-bold text-[#1a2430] block">Senha</label>
          <div className="relative">
            <input
              id="password" type={showPassword ? 'text' : 'password'}
              placeholder="Mínimo 6 caracteres" autoComplete="new-password"
              className={`${inputCls} pr-12`} style={inputStyle}
              {...register('password')}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5f6b78] hover:text-[#1a2430] transition-colors">
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm_password" className="text-sm font-bold text-[#1a2430] block">Confirmar senha</label>
          <input
            id="confirm_password" type="password" placeholder="Repita a senha" autoComplete="new-password"
            className={inputCls} style={inputStyle}
            {...register('confirm_password')}
          />
          {errors.confirm_password && <p className="text-sm text-red-500">{errors.confirm_password.message}</p>}
        </div>

        {serverError && (
          <div className="text-sm text-center py-2.5 px-4 rounded-xl bg-red-50 text-red-600 border border-red-100">
            {serverError}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="w-full h-12 rounded-2xl text-[15px] font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0a0a0a', boxShadow: '0 8px 24px rgba(255,184,0,0.25)' }}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-[#0a0a0a]" /> : 'Criar minha conta'}
        </button>
      </form>

      <p className="text-center text-base text-[#5f6b78]">
        Já tem uma conta?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-bold hover:underline" style={{ color: '#FFB800' }}
        >
          Entrar na plataforma
        </Link>
      </p>
    </div>
  )
}
