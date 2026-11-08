import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LancamentoConfigForm } from '@/components/admin/LancamentoConfigForm'

export default async function AdminLancamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const [{ data: config }, { data: lives }] = await Promise.all([
    sb.from('launch_config').select('*').eq('is_active', true).single(),
    sb.from('launch_lives').select('*').order('sort_order'),
  ])

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-[#1a2430]" style={{ fontFamily: 'var(--font-fraunces, Georgia, serif)' }}>
          Configurar Lançamento
        </h1>
        <p className="text-sm text-[#5f6b78] mt-1">Edite os dados da aula introdutória, aulas ao vivo, produto e palavras-chave.</p>
      </div>
      <LancamentoConfigForm config={config} lives={lives ?? []} />
    </div>
  )
}
