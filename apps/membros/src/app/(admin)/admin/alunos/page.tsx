import { createClient } from '@/lib/supabase/server'
import { getAdminProducts } from '@/lib/actions/admin-store'
import { AlunosClient } from './AlunosClient'

export const metadata = { title: 'Alunos — Admin IDM' }

export type AlunoRow = {
  enrollment_id: string
  user_id: string
  product_id: string
  product_title: string
  product_slug: string
  is_active: boolean
  enrolled_at: string
  full_name: string | null
  email: string | null
  role: string
}

export default async function AdminAlunosPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any

  // Busca matrículas com dados do aluno e do produto
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      id,
      user_id,
      product_id,
      is_active,
      created_at,
      products (id, title, slug),
      profiles (full_name, role)
    `)
    .order('created_at', { ascending: false })

  // Busca emails dos usuários via auth — só admins conseguem listar
  const { data: usersData } = await supabase.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const u of (usersData?.users ?? [])) {
    emailMap[u.id] = u.email ?? ''
  }

  const products = await getAdminProducts()

  const rows: AlunoRow[] = (enrollments ?? []).map((e: {
    id: string; user_id: string; product_id: string; is_active: boolean; created_at: string
    products: { id: string; title: string; slug: string } | null
    profiles: { full_name: string | null; role: string } | null
  }) => ({
    enrollment_id: e.id,
    user_id: e.user_id,
    product_id: e.product_id,
    product_title: e.products?.title ?? 'Produto removido',
    product_slug: e.products?.slug ?? '',
    is_active: e.is_active,
    enrolled_at: e.created_at,
    full_name: e.profiles?.full_name ?? null,
    email: emailMap[e.user_id] ?? null,
    role: e.profiles?.role ?? 'student',
  }))

  return (
    <AlunosClient
      initialRows={rows}
      products={products.map(p => ({ id: p.id, title: p.title }))}
    />
  )
}
