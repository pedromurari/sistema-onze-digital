import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

export const registerSchema = z.object({
  full_name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'As senhas não coincidem',
  path: ['confirm_password'],
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'As senhas não coincidem',
  path: ['confirm_password'],
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
