import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
  href?: string
  download?: boolean | string
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-accent text-text-inverse hover:bg-accent-hover',
  secondary: 'bg-bg-surface border border-border-default text-text-primary hover:bg-bg-elevated',
  ghost:     'text-text-secondary hover:text-text-primary',
  danger:    'bg-error/10 border border-error text-error hover:bg-error/20',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-base',
}

// Spinner rendered inline — replaces text content while loading
function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  href,
  download,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  const classes = [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-100',
    'active:scale-[0.98]',
    isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].join(' ')

  if (href) {
    return (
      <a
        href={isDisabled ? undefined : href}
        download={download}
        className={classes}
        aria-disabled={isDisabled}
      >
        {loading ? <Spinner /> : children}
      </a>
    )
  }

  return (
    <button
      {...rest}
      disabled={isDisabled}
      className={classes}
    >
      {loading ? <Spinner /> : children}
    </button>
  )
}
