'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth'
import { updatePassword } from '@/lib/actions/auth'

const inputCls = 'w-full h-12 px-4 rounded-2xl text-[#1a2430] text-[15px] outline-none transition-all'
const inputStyle = { background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(23,36,50,0.1)' }

export function ResetPasswordForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  })

  async function onSubmit(data: ResetPasswordInput) {
    setLoading(true)
    setServerError(null)
    const fd = new FormData()
    fd.append('password', data.password)
    const result = await updatePassword(fd)
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
          Nova senha
        </h1>
        <p className="text-base text-[#5f6b78]">
          Escolha uma nova senha segura para sua conta.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-bold text-[#1a2430] block">Nova senha</label>
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
          <label htmlFor="confirm_password" className="text-sm font-bold text-[#1a2430] block">Confirmar nova senha</label>
          <input
            id="confirm_password" type="password"
            placeholder="Repita a nova senha" autoComplete="new-password"
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
          className="w-full h-12 rounded-2xl text-[15px] font-bold transition-all hover:opacity-90 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #FFB800, #FFC933)', color: '#0a0a0a', boxShadow: '0 8px 24px rgba(255,184,0,0.25)' }}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-[#0a0a0a]" /> : 'Redefinir senha'}
        </button>
      </form>
    </div>
  )
}
