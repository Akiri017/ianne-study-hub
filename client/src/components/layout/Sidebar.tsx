import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { NavLink } from 'react-router-dom'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import SectionLabel from '../ui/SectionLabel'
import { getSubjects, deleteSubject, type Subject } from '../../lib/api'

// ---------------------------------------------------------------------------
// NewSubjectModal
// Controlled externally — isOpen and setIsOpen come from AppShell so other
// parts of the UI (e.g. DashboardPage empty state) can trigger it too.
// ---------------------------------------------------------------------------

interface NewSubjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

function NewSubjectModal({ isOpen, onClose, onCreated }: NewSubjectModalProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset and focus on open
  useEffect(() => {
    if (isOpen) {
      setName('')
      setError(null)
      // Small delay to let the modal animation settle before focusing
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Subject name is required.'); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" title="New Subject">
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        <SectionLabel>New Subject</SectionLabel>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="subject-name" className="text-text-secondary text-xs font-mono uppercase tracking-widest">
            Subject Name
          </label>
          <input
            ref={inputRef}
            id="subject-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Operating Systems"
            maxLength={120}
            className="h-9 px-3 rounded-md bg-bg-subtle border border-border-default text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors"
          />
          {error && (
            <p className="text-error text-xs font-mono">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// SubjectTreeItem
// Shows subject name + chevron + 0 module count badge.
// Expand/collapse toggles an inline "No modules yet" message.
// Delete button (×) appears on hover; confirms before firing DELETE.
// ---------------------------------------------------------------------------

interface SubjectTreeItemProps {
  subject: Subject
  onDeleted: () => void
}

function SubjectTreeItem({ subject, onDeleted }: SubjectTreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    // Stop the row click (expand/collapse) from firing
    e.stopPropagation()

    if (!window.confirm(`Delete "${subject.name}"? This will remove all associated modules, outputs, weak points, and tasks.`)) {
      return
    }

    setDeleting(true)
    try {
      const result = await deleteSubject(subject.id)
      if ('error' in result) {
        console.error('[Sidebar] delete subject error:', result.error)
      } else {
        onDeleted()
      }
    } catch (err) {
      console.error('[Sidebar] delete subject network error:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      {/* Subject row — wraps the NavLink for active styling + expand trigger */}
      <div className="relative group flex items-center">
        {/* NavLink provides the /subjects/:id navigation and active left-border styling */}
        <NavLink
          to={`/subjects/${subject.id}`}
          className={({ isActive }) =>
            [
              'flex-1 flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-elevated transition-colors duration-100 min-w-0',
              isActive ? 'border-l-2 border-accent text-text-primary' : 'text-text-secondary',
            ].join(' ')
          }
          onClick={(e) => {
            // Also toggle expand when clicking the nav item
            // (navigation happens; this just controls the tree state)
            e.preventDefault()
            setExpanded((v) => !v)
          }}
        >
          <span className="truncate flex-1 text-sm">{subject.name}</span>

          {/* Module count badge — 0 for now; populated in modules task */}
          <span className="font-mono text-xs bg-bg-subtle text-text-muted px-1.5 py-0.5 rounded-sm shrink-0">
            0
          </span>

          {/* Chevron */}
          <span className={`text-text-muted text-xs transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`}>
            ›
          </span>
        </NavLink>

        {/* Delete button — only visible on group hover */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Delete ${subject.name}`}
          className="absolute right-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-text-muted hover:text-error transition-opacity duration-100 p-1 rounded"
        >
          <span className="text-xs leading-none">×</span>
        </button>
      </div>

      {/* Expanded: module list placeholder — module fetching is a later task */}
      {expanded && (
        <div className="pl-6 pb-1">
          <p className="text-text-muted text-xs font-mono py-1 px-2">No modules yet.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton shimmer rows for loading state
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <div className="px-3 py-2 flex flex-col gap-2" aria-label="Loading subjects">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-6 rounded bg-bg-elevated animate-pulse"
          style={{ width: `${60 + i * 10}%` }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  /** Controls whether the New Subject modal is open — owned by AppShell */
  newSubjectOpen: boolean
  setNewSubjectOpen: (open: boolean) => void
  /** Called after a subject is successfully created so AppShell can bump the version */
  onSubjectCreated: () => void
  /**
   * Incremented by AppShell when a subject is created or deleted.
   * Sidebar watches this to trigger a refetch.
   */
  subjectListVersion: number
}

/**
 * 240px fixed sidebar.
 * Fetches subjects from GET /api/subjects on mount and whenever subjectListVersion changes.
 * The New Subject modal state is owned externally (AppShell) so DashboardPage can
 * open it via AppContext without the modal living in this component's state.
 */
export default function Sidebar({
  newSubjectOpen,
  setNewSubjectOpen,
  onSubjectCreated,
  subjectListVersion,
}: SidebarProps) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchSubjects = useCallback(async () => {
    try {
      const data = await getSubjects()
      setSubjects(data.subjects ?? [])
      setFetchError(null)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load subjects.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Refetch when the list version bumps (subject created or deleted)
  useEffect(() => {
    fetchSubjects()
  }, [fetchSubjects, subjectListVersion])

  const handleSubjectCreated = () => {
    onSubjectCreated() // tell AppShell to bump version → triggers refetch
  }

  const handleSubjectDeleted = () => {
    onSubjectCreated() // same signal — reuse the version bump mechanism
  }

  return (
    <>
      <aside className="w-60 h-full bg-bg-surface border-r border-border-default flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border-default shrink-0">
          <p className="font-mono text-sm font-semibold text-text-secondary tracking-widest">
            STUDY HUB
          </p>
          <p className="font-mono text-xs text-text-muted mt-0.5">v1.0</p>
        </div>

        {/* Navigation */}
        <nav className="px-2 pt-3 pb-2 shrink-0">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors duration-100',
                isActive
                  ? 'text-text-primary bg-bg-elevated border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
              ].join(' ')
            }
          >
            Dashboard
          </NavLink>
        </nav>

        {/* Separator */}
        <div className="mx-3 border-t border-border-default shrink-0" />

        {/* Subject list — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 pt-2">
          <div className="px-3 pb-1">
            <SectionLabel className="mb-2">Subjects</SectionLabel>
          </div>

          {loading && <SkeletonRows />}

          {!loading && fetchError && (
            <p className="px-3 text-error text-xs font-mono">{fetchError}</p>
          )}

          {!loading && !fetchError && subjects.length === 0 && (
            <p className="px-3 text-text-muted text-xs font-mono">No subjects yet.</p>
          )}

          {!loading && !fetchError && subjects.map((subject) => (
            <SubjectTreeItem
              key={subject.id}
              subject={subject}
              onDeleted={handleSubjectDeleted}
            />
          ))}
        </div>

        {/* New Subject button — pinned to bottom of sidebar */}
        <div className="px-3 py-3 border-t border-border-default shrink-0">
          <button
            onClick={() => setNewSubjectOpen(true)}
            className="w-full flex items-center gap-1.5 text-text-secondary text-sm hover:text-text-primary transition-colors duration-100 py-1"
          >
            <span className="text-base leading-none">+</span>
            <span>New Subject</span>
          </button>
        </div>
      </aside>

      <NewSubjectModal
        isOpen={newSubjectOpen}
        onClose={() => setNewSubjectOpen(false)}
        onCreated={handleSubjectCreated}
      />
    </>
  )
}
