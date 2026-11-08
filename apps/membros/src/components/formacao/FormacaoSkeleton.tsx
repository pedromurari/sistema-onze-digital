export function Bar({ w = '100%', h = 14, className = '' }: { w?: string | number; h?: number; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-white/[0.06] ${className}`}
      style={{ width: w, height: h }}
    />
  )
}

export function CardSkeleton({ h = 72 }: { h?: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] p-4 flex items-center gap-4" style={{ background: '#0A1232', height: h }}>
      <div className="w-10 h-10 rounded-xl bg-white/[0.06] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <Bar w="60%" h={12} />
        <Bar w="35%" h={10} />
      </div>
    </div>
  )
}

export function FormacaoPageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[820px] mx-auto space-y-6">
        <Bar w={140} h={16} />
        <div className="space-y-2">
          <Bar w="45%" h={22} />
          <Bar w="70%" h={12} />
        </div>
        <div className="space-y-3">
          {Array.from({ length: cards }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
