'use client'

import { useRouter } from 'next/navigation'

/**
 * Botao "Voltar" das paginas de Termos/Privacidade. Usa o historico do
 * navegador em vez de um link fixo -- assim volta pra pagina de produto
 * de onde a pessoa veio (ex: /cicatrizes), nao sempre pra home.
 */
export function VoltarLink({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter()

  const voltar = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/comecar')
    }
  }

  return (
    <button onClick={voltar} className={className}>
      {children}
    </button>
  )
}
