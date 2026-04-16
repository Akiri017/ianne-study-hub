import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'accent' | 'open' | 'patched' | 'confirmed'
  className?: string
}

// Variant map — uses CSS custom properties via Tailwind config tokens
const variantClasses: Record<string, string> = {
  default:   'bg-bg-subtle text-text-muted border border-border-default',
  accent:    'bg-accent-subtle text-accent border border-accent/30',
  open:      'bg-status-open-bg text-status-open',
  patched:   'bg-status-patched-bg text-status-patched',
  confirmed: 'bg-status-confirmed-bg text-status-confirmed',
}

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wide ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
