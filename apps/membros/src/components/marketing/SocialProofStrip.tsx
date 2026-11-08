import { Users, Star, Trophy, Heart } from 'lucide-react'

const stats = [
  { icon: Users,  value: '2.400+',  label: 'alunos transformados' },
  { icon: Star,   value: '4.9',     label: 'avaliação média' },
  { icon: Trophy, value: '94%',     label: 'taxa de conclusão' },
  { icon: Heart,  value: '100%',    label: 'satisfação garantida' },
]

export function SocialProofStrip() {
  return (
    <div className="w-full rounded-2xl border border-[#FFB800]/20 bg-[#FFB800]/5 px-6 py-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center">
            <Icon className="h-5 w-5 text-[#FFB800]" />
            <span className="text-2xl font-bold text-white">{value}</span>
            <span className="text-xs text-white/50">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
