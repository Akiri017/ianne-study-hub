/**
 * ModuleView — displays a single module with its three output tabs.
 * Route: /subjects/:subjectId/modules/:moduleId
 *
 * Layout:
 *   Header (module title + file type badge + back link)
 *   Tab bar (Pre-Scan | Structured Notes | Quiz)
 *   OutputPanel (one per tab, rendered based on active tab)
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import Badge from '../components/ui/Badge'
import OutputPanel from '../components/output/OutputPanel'
import { getModules, getSubjects } from '../lib/api'
import type { Module, AiOutput } from '../lib/api'
import { useAppContext } from '../lib/app-context'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OutputTab = 'prescan' | 'notes' | 'quiz'

const TABS: { key: OutputTab; label: string }[] = [
  { key: 'prescan', label: 'Pre-Scan' },
  { key: 'notes', label: 'Structured Notes' },
  { key: 'quiz', label: 'Quiz' },
]

// ---------------------------------------------------------------------------
// Loading skeleton — 3 muted placeholder bars
// ---------------------------------------------------------------------------

function ModuleSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-6 py-8 max-w-3xl mx-auto" aria-label="Loading module">
      <div className="h-6 w-48 rounded bg-bg-elevated animate-pulse" />
      <div className="h-4 w-32 rounded bg-bg-elevated animate-pulse" />
      <div className="h-4 w-64 rounded bg-bg-elevated animate-pulse" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ModuleView
// ---------------------------------------------------------------------------

export default function ModuleView() {
  const { subjectId, moduleId } = useParams<{ subjectId: string; moduleId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { setBreadcrumb } = useAppContext()

  const numericSubjectId = Number(subjectId)
  const numericModuleId = Number(moduleId)

  const [module, setModule] = useState<Module | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<OutputTab>('prescan')
  const [subjectName, setSubjectName] = useState<string>('')

  // Module title may have been passed via router state from ModuleCard
  const routerModuleTitle = (location.state as { moduleTitle?: string } | null)?.moduleTitle

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchModule = useCallback(async () => {
    if (!numericSubjectId || !numericModuleId) return
    try {
      const data = await getModules(numericSubjectId)
      const found = (data.modules ?? []).find((m) => m.id === numericModuleId) ?? null
      setModule(found)
      setFetchError(null)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load module.')
    } finally {
      setLoading(false)
    }
  }, [numericSubjectId, numericModuleId])

  useEffect(() => {
    fetchModule()
  }, [fetchModule])

  // Fetch subject name for breadcrumb
  useEffect(() => {
    getSubjects()
      .then((data) => {
        const found = data.subjects.find((s) => s.id === numericSubjectId)
        if (found) setSubjectName(found.name)
      })
      .catch(() => {
        // Non-critical — breadcrumb subject segment will be absent
      })
  }, [numericSubjectId])

  // Push real subject + module names into the Topbar breadcrumb; clear on unmount
  useEffect(() => {
    const moduleTitle = module?.title ?? routerModuleTitle
    if (moduleTitle) {
      setBreadcrumb({ subject: subjectName || undefined, module: moduleTitle })
    }
    return () => { setBreadcrumb({}) }
  }, [module, routerModuleTitle, subjectName, setBreadcrumb])

  // ---------------------------------------------------------------------------
  // After OutputPanel signals a generation completed, refetch to get the
  // persisted output record with its real database id.
  // ---------------------------------------------------------------------------

  const handleOutputSaved = useCallback((_output: AiOutput) => {
    // Silently refetch — don't reset loading state to avoid layout shift
    fetchModule()
  }, [fetchModule])

  // ---------------------------------------------------------------------------
  // Derive the existing output for the active tab (or undefined if not generated)
  // ---------------------------------------------------------------------------

  const getExistingOutput = (tab: OutputTab): AiOutput | undefined => {
    if (!module) return undefined
    return module.outputs.find((o) => o.output_type === tab)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) return <ModuleSkeleton />

  if (fetchError || !module) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 px-6">
        <p className="text-text-muted text-sm font-mono">Module not found.</p>
        <button
          onClick={() => navigate(`/subjects/${subjectId}`)}
          className="text-accent text-xs font-mono hover:underline"
        >
          ← Back to subject
        </button>
      </div>
    )
  }

  const displayTitle = module.title ?? routerModuleTitle ?? `Module ${moduleId}`

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        {/* Back link */}
        <Link
          to={`/subjects/${subjectId}`}
          className="text-text-muted text-xs font-mono hover:text-text-secondary transition-colors"
        >
          ← Back to subject
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-text-primary text-xl font-semibold">{displayTitle}</h1>
          <Badge>{module.file_type.toUpperCase()}</Badge>
        </div>

        <p className="text-text-muted text-xs font-mono">
          {module.outputs.length} output{module.outputs.length !== 1 ? 's' : ''} generated
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-border-default">
        {TABS.map(({ key, label }) => {
          const isActive = activeTab === key
          const hasOutput = module.outputs.some((o) => o.output_type === key)
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'px-4 py-2 text-xs font-mono font-semibold tracking-widest uppercase transition-colors duration-100 border-b-2 -mb-px',
                isActive
                  ? 'text-text-primary border-accent'
                  : 'text-text-muted border-transparent hover:text-text-secondary',
              ].join(' ')}
            >
              {label}
              {/* Dot indicator when output exists for this tab */}
              {hasOutput && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" />
              )}
            </button>
          )
        })}
      </div>

      {/* Output panels — all three are mounted; only the active one is visible.
          Keeping them mounted preserves generated content when switching tabs. */}
      <div className="bg-bg-surface border border-border-default rounded-md overflow-hidden">
        {TABS.map(({ key }) => (
          <div key={key} className={activeTab === key ? '' : 'hidden'}>
            <OutputPanel
              outputType={key}
              moduleId={numericModuleId}
              subjectId={numericSubjectId}
              existingOutput={getExistingOutput(key)}
              onOutputSaved={handleOutputSaved}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
