/**
 * ModuleCard — a horizontal card showing a single module and its output status.
 * Clicking anywhere on the card navigates to the Module View page.
 * Output type chips are highlighted when that type has been generated.
 */

import { useNavigate } from 'react-router-dom'
import { formatDate } from '../../lib/utils'
import type { AiOutput } from '../../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModuleCardModule {
  id: number
  title: string
  file_type: 'pdf' | 'docx'
  created_at: string
  outputs: AiOutput[]
}

interface ModuleCardProps {
  module: ModuleCardModule
  subjectId: number
}

// ---------------------------------------------------------------------------
// Output chip labels
// ---------------------------------------------------------------------------

const OUTPUT_CHIP_LABELS: Record<'prescan' | 'notes' | 'quiz', string> = {
  prescan: 'PRE-SCAN',
  notes: 'NOTES',
  quiz: 'QUIZ',
}

const OUTPUT_TYPES: ('prescan' | 'notes' | 'quiz')[] = ['prescan', 'notes', 'quiz']

// ---------------------------------------------------------------------------
// ModuleCard
// ---------------------------------------------------------------------------

export default function ModuleCard({ module, subjectId }: ModuleCardProps) {
  const navigate = useNavigate()

  // Build a set of output types that have been generated for fast lookup
  const generatedTypes = new Set(module.outputs.map((o) => o.output_type))

  const handleClick = () => {
    navigate(`/subjects/${subjectId}/modules/${module.id}`, {
      // Pass subject/module names via router state so views can use them
      // in breadcrumbs without an extra fetch
      state: { moduleTitle: module.title },
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      className="bg-bg-surface border border-border-default rounded-md p-4 flex items-center gap-4 hover:bg-bg-elevated hover:border-border-strong transition-colors duration-100 cursor-pointer"
      aria-label={`Open module: ${module.title}`}
    >
      {/* Left — title, file type badge, created date */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text-primary text-sm font-medium truncate">
            {module.title}
          </span>
          {/* File type badge */}
          <span className="font-mono text-xs bg-bg-subtle text-text-muted px-1.5 py-0.5 rounded-sm shrink-0 uppercase">
            {module.file_type}
          </span>
        </div>
        <span className="text-text-secondary text-xs font-mono">
          {formatDate(module.created_at)}
        </span>
      </div>

      {/* Right — output status chips */}
      <div className="flex items-center gap-1.5 shrink-0">
        {OUTPUT_TYPES.map((type) => {
          const hasOutput = generatedTypes.has(type)
          return (
            <span
              key={type}
              className={
                hasOutput
                  ? 'bg-accent-subtle text-accent text-xs font-mono px-2 py-0.5 rounded-sm'
                  : 'bg-bg-subtle text-text-muted text-xs font-mono px-2 py-0.5 rounded-sm'
              }
            >
              {OUTPUT_CHIP_LABELS[type]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
