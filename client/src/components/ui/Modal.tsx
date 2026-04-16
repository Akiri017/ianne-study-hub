import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg'
  /** Optional accessible title for screen readers */
  title?: string
}

const maxWidthClasses = {
  sm: 'max-w-[480px]',
  md: 'max-w-[540px]',
  lg: 'max-w-[640px]',
}

/**
 * Generic modal wrapper.
 * - Backdrop closes the modal on click.
 * - Escape key closes the modal.
 * - Focus is trapped inside the panel while open.
 */
export default function Modal({ isOpen, onClose, children, maxWidth = 'md', title }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Focus trap — cycle focus within the modal panel
  useEffect(() => {
    if (!isOpen || !panelRef.current) return

    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Move focus into modal on open
    first?.focus()

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [isOpen])

  if (!isOpen) return null

  return (
    // Backdrop — clicking outside the panel closes the modal
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Panel — stop propagation so clicking inside doesn't close */}
      <div
        ref={panelRef}
        className={`w-full ${maxWidthClasses[maxWidth]} bg-bg-surface border border-border-default rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)] mx-4 animate-[fadeScaleIn_200ms_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
