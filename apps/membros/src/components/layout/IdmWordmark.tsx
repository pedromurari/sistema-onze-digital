import Image from 'next/image'

interface IdmWordmarkProps {
  variant?: 'default' | 'white'
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { symbol: 28, titleText: 'text-[11px]', subtitleText: 'text-[9px]' },
  md: { symbol: 34, titleText: 'text-[13px]', subtitleText: 'text-[10px]' },
  lg: { symbol: 44, titleText: 'text-[16px]', subtitleText: 'text-[12px]' },
}

export function IdmWordmark({ variant = 'default', size = 'md' }: IdmWordmarkProps) {
  const s = sizes[size]
  const isWhite = variant === 'white'

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="shrink-0" style={{ width: s.symbol, height: s.symbol }}>
        <Image
          src={isWhite ? '/despertamente-simbolo-branco.png' : '/despertamente-simbolo.png'}
          alt="Símbolo Despertamente"
          width={s.symbol}
          height={s.symbol}
          className="object-contain"
          priority
        />
      </div>
      <div className="leading-none">
        <p className={`${s.subtitleText} font-bold tracking-[0.12em] uppercase ${isWhite ? 'text-white/50' : 'text-[#5f6b78]'}`}>
          Instituto
        </p>
        <p className={`${s.titleText} font-black tracking-tight leading-tight ${isWhite ? 'text-white' : 'text-[#1a2430]'}`}>
          Despertamente
        </p>
      </div>
    </div>
  )
}
