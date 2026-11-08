export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0D1638]">
      <div className="px-4 sm:px-6 lg:px-10 pt-10 pb-8 md:pt-14 md:pb-10">
        <div className="max-w-[880px] mx-auto space-y-8">
          <div className="space-y-3">
            <div className="w-40 h-3 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-2/3 h-8 rounded bg-white/[0.06] animate-pulse" />
            <div className="w-1/2 h-4 rounded bg-white/[0.05] animate-pulse" />
          </div>
          <div className="rounded-3xl border border-white/[0.08] p-6 sm:p-7" style={{ background: '#0A1232' }}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-1/3 h-4 rounded bg-white/[0.06] animate-pulse" />
                <div className="w-1/4 h-3 rounded bg-white/[0.05] animate-pulse" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.08] p-5 flex items-center gap-4" style={{ background: '#0A1232' }}>
                <div className="w-10 h-10 rounded-full bg-white/[0.06] animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-2/5 h-4 rounded bg-white/[0.06] animate-pulse" />
                  <div className="w-1/4 h-3 rounded bg-white/[0.05] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
