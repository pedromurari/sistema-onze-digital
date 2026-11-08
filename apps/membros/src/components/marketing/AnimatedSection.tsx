interface AnimatedSectionProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function AnimatedSection({ children, className = '' }: AnimatedSectionProps) {
  return <div className={`w-full ${className}`}>{children}</div>
}

export function AnimatedCard({ children, className = '' }: AnimatedSectionProps) {
  return <div className={`w-full ${className}`}>{children}</div>
}
