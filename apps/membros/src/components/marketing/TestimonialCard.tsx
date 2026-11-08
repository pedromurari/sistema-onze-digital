import Image from 'next/image'
import { Star } from 'lucide-react'
import type { Testimonial } from '@/lib/actions/store'

interface TestimonialCardProps {
  testimonial: Testimonial
}

export function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[#0A1232] p-5 shadow-sm">
      {/* Estrelas */}
      {testimonial.rating && (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${i < testimonial.rating! ? 'fill-[#FFB800] text-[#FFB800]' : 'text-white/20'}`}
            />
          ))}
        </div>
      )}

      {/* Texto */}
      <p className="text-sm leading-relaxed text-white/80 italic">
        &ldquo;{testimonial.content}&rdquo;
      </p>

      {/* Autor */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/10">
        {testimonial.avatar_url ? (
          <Image
            src={testimonial.avatar_url}
            alt={testimonial.author_name}
            width={36}
            height={36}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFB800]/20 text-sm font-bold text-[#FFB800]">
            {testimonial.author_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-white">{testimonial.author_name}</p>
          {testimonial.author_role && (
            <p className="text-xs text-white/50">{testimonial.author_role}</p>
          )}
        </div>
      </div>
    </div>
  )
}
