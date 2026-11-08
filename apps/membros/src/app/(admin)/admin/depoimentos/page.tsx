import { getAdminTestimonials } from '@/lib/actions/admin-store'
import { TestimonialManager } from '@/components/admin/TestimonialManager'

export default async function AdminDepoimentosPage() {
  const testimonials = await getAdminTestimonials()
  return <TestimonialManager initial={testimonials} />
}
