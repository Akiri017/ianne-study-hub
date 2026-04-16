import type { ReactNode } from 'react'

interface SectionLabelProps {
  children: ReactNode
  className?: string
}

// Section labels give the app an IDE/terminal feel — ALL CAPS mono, always
export default function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <p className={`font-mono text-xs font-semibold text-text-secondary tracking-widest uppercase ${className}`}>
      {children}
    </p>
  )
}
