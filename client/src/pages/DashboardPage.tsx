import SectionLabel from '../components/ui/SectionLabel'
import Button from '../components/ui/Button'
import { useAppContext } from '../lib/app-context'

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: number | string
  /** When true, a non-zero value is rendered in red to signal urgency */
  alertOnNonZero?: boolean
}

function StatCard({ label, value, alertOnNonZero = false }: StatCardProps) {
  const isAlert = alertOnNonZero && typeof value === 'number' && value > 0

  return (
    <div className="bg-bg-surface border border-border-default rounded-md p-4 flex flex-col gap-1">
      <span
        className={`text-2xl font-semibold font-mono ${isAlert ? 'text-error' : 'text-text-primary'}`}
      >
        {value}
      </span>
      <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

/**
 * Route: /
 *
 * Displays a stats strip and a recent modules section.
 * Data is hardcoded to 0 / empty for now — wired in later tasks once
 * API hooks are built.
 *
 * The "New Subject" button in the empty state is wired to AppContext.openNewSubject
 * so it opens the same modal controlled by AppShell, without prop-drilling
 * through Outlet.
 */
export default function DashboardPage() {
  const { openNewSubject } = useAppContext()

  // Hardcoded until data hooks are wired — later task
  const openWeakPoints = 0
  const upcomingDeadlines = 0
  // Subjects count used for empty state — replaced by real fetch in later task
  const hasSubjects = false

  return (
    <div className="p-6 flex flex-col gap-8 max-w-4xl">
      {/* Page title */}
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Dashboard</h1>
        <p className="text-text-muted text-sm mt-0.5">Overview of your study progress</p>
      </div>

      {/* Stats strip */}
      <section className="grid grid-cols-3 gap-4">
        <StatCard
          label="Open Weak Points"
          value={openWeakPoints}
          alertOnNonZero
        />
        <StatCard
          label="Upcoming Deadlines"
          value={upcomingDeadlines}
        />
        {/* Third card — placeholder for a future metric */}
        <div className="bg-bg-surface border border-border-default rounded-md p-4 flex items-center justify-center">
          <span className="text-text-muted text-xs font-mono uppercase tracking-widest">More stats soon</span>
        </div>
      </section>

      {/* Recent modules section */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Recent Modules</SectionLabel>

        {/* Empty state — shown until real data is wired */}
        <div className="bg-bg-surface border border-border-default rounded-md p-6 flex flex-col items-center gap-3 text-center">
          <p className="text-text-muted text-sm">No modules yet.</p>
        </div>
      </section>

      {/* No subjects empty state */}
      {!hasSubjects && (
        <section className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-text-secondary text-sm">
            No subjects yet. Create your first subject to get started.
          </p>
          {/*
            openNewSubject comes from AppContext — AppShell owns the modal state and
            passes the opener via context so this button and the Sidebar button both
            control the same modal instance.
          */}
          <Button variant="primary" size="sm" onClick={openNewSubject}>
            New Subject
          </Button>
        </section>
      )}
    </div>
  )
}
