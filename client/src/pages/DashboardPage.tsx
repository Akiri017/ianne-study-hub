import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SectionLabel from '../components/ui/SectionLabel'
import Button from '../components/ui/Button'
import { useAppContext } from '../lib/app-context'
import { getDashboardStats, getTasks, type DashboardStats, type Task } from '../lib/api'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: number | string
  alertOnNonZero?: boolean
}

function StatCard({ label, value, alertOnNonZero = false }: StatCardProps) {
  const isAlert = alertOnNonZero && typeof value === 'number' && value > 0
  return (
    <div className="bg-bg-surface border border-border-default rounded-md p-4 flex flex-col gap-1">
      <span className={`text-2xl font-semibold font-mono ${isAlert ? 'text-error' : 'text-text-primary'}`}>
        {value}
      </span>
      <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countUpcomingDeadlines(tasks: Task[]): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 7)
  return tasks.filter((t) => {
    if (t.completed) return false
    const due = new Date(t.due_date)
    return due <= cutoff
  }).length
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { openNewSubject } = useAppContext()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [upcomingDeadlines, setUpcomingDeadlines] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDashboardStats(), getTasks()])
      .then(([s, { tasks }]) => {
        setStats(s)
        setUpcomingDeadlines(countUpcomingDeadlines(tasks))
      })
      .catch(() => {
        // Dashboard still renders with — placeholders on error
      })
      .finally(() => setLoading(false))
  }, [])

  const dash = loading ? '—' : undefined
  const openWeakPoints = dash ?? stats?.open_weak_points ?? '—'
  const totalModules = dash ?? stats?.total_modules ?? '—'
  const deadlines = loading ? '—' : upcomingDeadlines
  const recentModules = stats?.recent_modules ?? []
  const hasSubjects = !loading && stats !== null

  return (
    <div className="p-6 flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Dashboard</h1>
        <p className="text-text-muted text-sm mt-0.5">Overview of your study progress</p>
      </div>

      {/* Stats strip */}
      <section className="grid grid-cols-3 gap-4">
        <StatCard label="Open Weak Points" value={openWeakPoints} alertOnNonZero />
        <StatCard label="Due This Week" value={deadlines} />
        <StatCard label="Total Modules" value={totalModules} />
      </section>

      {/* Recent modules */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Recent Modules</SectionLabel>

        {loading && (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-bg-elevated animate-pulse" />
            ))}
          </div>
        )}

        {!loading && recentModules.length === 0 && (
          <div className="bg-bg-surface border border-border-default rounded-md p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-text-muted text-sm">No modules yet.</p>
          </div>
        )}

        {!loading && recentModules.length > 0 && (
          <div className="flex flex-col gap-1">
            {recentModules.map((mod) => (
              <Link
                key={mod.id}
                to={`/subjects/${mod.subject_id}/modules/${mod.id}`}
                state={{ moduleTitle: mod.title }}
                className="flex items-center gap-3 px-4 py-2.5 bg-bg-surface border border-border-default rounded-md hover:bg-bg-elevated transition-colors duration-100 min-w-0"
              >
                <span className="flex-1 text-sm text-text-primary truncate">{mod.title}</span>
                {mod.subject_name && (
                  <span className="font-mono text-xs text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded-sm shrink-0">
                    {mod.subject_name}
                  </span>
                )}
                <span className="font-mono text-[10px] bg-bg-subtle text-text-muted px-1 py-0.5 rounded-sm uppercase shrink-0">
                  {mod.file_type}
                </span>
                <span className="text-xs text-text-muted font-mono shrink-0">
                  {mod.created_at.slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* No subjects empty state */}
      {!loading && !hasSubjects && (
        <section className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-text-secondary text-sm">
            No subjects yet. Create your first subject to get started.
          </p>
          <Button variant="primary" size="sm" onClick={openNewSubject}>
            New Subject
          </Button>
        </section>
      )}
    </div>
  )
}
