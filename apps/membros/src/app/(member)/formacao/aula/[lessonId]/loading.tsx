export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0D1638] px-4 sm:px-6 lg:px-10 py-6">
      <div className="max-w-[820px] mx-auto space-y-4">
        <div className="w-32 h-4 rounded bg-white/[0.06] animate-pulse" />
        <div className="w-2/3 h-6 rounded bg-white/[0.06] animate-pulse" />
        <div className="aspect-video rounded-xl bg-white/[0.05] animate-pulse" />
      </div>
    </div>
  )
}
