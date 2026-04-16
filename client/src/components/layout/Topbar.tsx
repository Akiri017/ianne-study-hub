interface Breadcrumb {
  subject?: string
  module?: string
}

interface TopbarProps {
  breadcrumb: Breadcrumb
  onToggleRightPanel: () => void
  rightPanelOpen: boolean
}

/**
 * Full-width top bar — 48px height.
 * Left: wordmark. Center: breadcrumb. Right: right-panel toggle.
 */
export default function Topbar({ breadcrumb, onToggleRightPanel, rightPanelOpen }: TopbarProps) {
  const hasBreadcrumb = breadcrumb.subject || breadcrumb.module

  return (
    <header className="h-12 w-full flex items-center px-4 bg-bg-surface border-b border-border-default shrink-0">
      {/* Left — wordmark */}
      <span className="font-mono text-sm font-semibold text-text-secondary tracking-widest w-[240px] shrink-0">
        STUDY HUB
      </span>

      {/* Center — breadcrumb */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {hasBreadcrumb && (
          <p className="text-text-secondary text-sm truncate">
            {breadcrumb.subject && (
              <span>{breadcrumb.subject}</span>
            )}
            {breadcrumb.subject && breadcrumb.module && (
              <span className="mx-2 text-text-muted">›</span>
            )}
            {breadcrumb.module && (
              <span>{breadcrumb.module}</span>
            )}
          </p>
        )}
      </div>

      {/* Right — right panel toggle */}
      <div className="w-[240px] shrink-0 flex justify-end items-center gap-2">
        {/* Active dot — always visible in v1 since panel always has tab content */}
        {rightPanelOpen && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        )}
        <button
          onClick={onToggleRightPanel}
          title={rightPanelOpen ? 'Close panel' : 'Open panel'}
          className="w-8 h-8 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors duration-100"
          aria-label="Toggle right panel"
        >
          {/* Simple panel icon using unicode box chars */}
          <span className="font-mono text-base leading-none select-none">
            {rightPanelOpen ? '⊟' : '⊞'}
          </span>
        </button>
      </div>
    </header>
  )
}
