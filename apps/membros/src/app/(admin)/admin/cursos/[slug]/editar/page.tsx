import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getAdminCourseBySlug } from '@/lib/actions/admin-courses'
import { CourseEditor } from '@/components/admin/CourseEditor'

export default async function AdminCursoEditarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getAdminCourseBySlug(slug)
  if (!course) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/cursos"
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: '#1a1a1a', color: '#888' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{course.title}</h1>
          <p className="text-xs" style={{ color: '#555' }}>
            {course.modules.length} módulo{course.modules.length !== 1 ? 's' : ''} · {course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} aulas
          </p>
        </div>
      </div>

      <CourseEditor course={course} />
    </div>
  )
}
