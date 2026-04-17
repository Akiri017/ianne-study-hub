import { useState, useEffect, useCallback } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import SectionLabel from '../ui/SectionLabel'
import {
  getSubjects,
  getWeakPoints,
  createWeakPoint,
  updateWeakPoint,
  deleteWeakPoint,
  type Subject,
  type WeakPoint,
} from '../../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'Open' | 'Patched' | 'Confirmed'

const STATUSES: Status[] = ['Open', 'Patched', 'Confirmed']

// Maps Status → Badge variant prop
const statusVariant: Record<Status, 'open' | 'patched' | 'confirmed'> = {
  Open: 'open',
  Patched: 'patched',
  Confirmed: 'confirmed',
}

// Enriched weak point that also carries the subject name for display
interface WeakPointWithSubject extends WeakPoint {
  subjectName: string
}

// ── ErrorCard ─────────────────────────────────────────────────────────────────

interface ErrorCardProps {
  wp: WeakPointWithSubject
  onClick: () => void
}

function ErrorCard({ wp, onClick }: ErrorCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="bg-bg-surface border border-border-default rounded-md p-3 flex flex-col gap-1 cursor-pointer hover:border-border-strong transition-colors duration-100"
    >
      {/* Top row: status badge + id */}
      <div className="flex items-center justify-between">
        <Badge variant={statusVariant[wp.status as Status]}>{wp.status}</Badge>
        <span className="font-mono text-xs text-text-muted">WP-{wp.id}</span>
      </div>

      {/* Topic */}
      <p className="text-sm font-medium text-text-primary truncate">{wp.topic}</p>

      {/* What went wrong */}
      <p className="text-xs text-text-secondary truncate">
        <span className="text-error mr-1">✗</span>
        {wp.what_went_wrong}
      </p>

      {/* Fix */}
      <p className="text-xs text-text-secondary truncate">
        <span className="text-success mr-1">✓</span>
        {wp.fix}
      </p>

      {/* Subject */}
      <p className="font-mono text-xs text-text-muted">{wp.subjectName}</p>
    </div>
  )
}

// ── ErrorCardModal ────────────────────────────────────────────────────────────

interface ErrorCardModalProps {
  mode: 'create' | 'edit'
  initial: Partial<WeakPoint>
  subjects: Subject[]
  onClose: () => void
  onSuccess: () => void
}

function ErrorCardModal({ mode, initial, subjects, onClose, onSuccess }: ErrorCardModalProps) {
  const [topic, setTopic] = useState(initial.topic ?? '')
  const [whatWentWrong, setWhatWentWrong] = useState(initial.what_went_wrong ?? '')
  const [whyMissed, setWhyMissed] = useState(initial.why_missed ?? '')
  const [fix, setFix] = useState(initial.fix ?? '')
  const [status, setStatus] = useState<Status>((initial.status as Status) ?? 'Open')
  const [subjectId, setSubjectId] = useState<number>(
    initial.subject_id ?? (subjects[0]?.id ?? 0)
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!topic.trim() || !whatWentWrong.trim() || !whyMissed.trim() || !fix.trim()) {
      setError('All fields are required.')
      return
    }
    if (!subjectId) {
      setError('Please select a subject.')
      return
    }

    setLoading(true)
    setError(null)

    const result = await createWeakPoint(subjectId, {
      topic: topic.trim(),
      what_went_wrong: whatWentWrong.trim(),
      why_missed: whyMissed.trim(),
      fix: fix.trim(),
      status,
    })

    setLoading(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    onSuccess()
  }

  const handleSave = async () => {
    if (!initial.id) return

    setLoading(true)
    setError(null)

    const result = await updateWeakPoint(initial.id, {
      topic: topic.trim(),
      what_went_wrong: whatWentWrong.trim(),
      why_missed: whyMissed.trim(),
      fix: fix.trim(),
      status,
    })

    setLoading(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    onSuccess()
  }

  const handleDelete = async () => {
    if (!initial.id) return
    if (!window.confirm(`Delete WP-${initial.id}? This cannot be undone.`)) return

    setLoading(true)

    const result = await deleteWeakPoint(initial.id)

    setLoading(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    onSuccess()
  }

  // Shared label style
  const labelClass = 'font-mono text-xs font-semibold tracking-widest text-text-secondary uppercase mb-1 block'
  const inputClass = 'w-full bg-bg-base border border-border-default rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-100'

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SectionLabel>{mode === 'create' ? 'New Weak Point' : `WP-${initial.id}`}</SectionLabel>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors duration-100 font-mono text-xs"
          aria-label="Close modal"
        >
          ESC
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <p className="text-xs text-error bg-error/10 border border-error/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* TOPIC */}
      <div>
        <label className={labelClass}>Topic</label>
        <input
          className={inputClass}
          placeholder="e.g. Process scheduling algorithms"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      {/* WHAT I GOT WRONG */}
      <div>
        <label className={labelClass}>What I Got Wrong</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="Describe the mistake..."
          value={whatWentWrong}
          onChange={(e) => setWhatWentWrong(e.target.value)}
        />
      </div>

      {/* WHY I MISSED IT */}
      <div>
        <label className={labelClass}>Why I Missed It</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="Root cause..."
          value={whyMissed}
          onChange={(e) => setWhyMissed(e.target.value)}
        />
      </div>

      {/* THE FIX */}
      <div>
        <label className={labelClass}>The Fix</label>
        <textarea
          className={`${inputClass} resize-none`}
          rows={2}
          placeholder="How to get it right next time..."
          value={fix}
          onChange={(e) => setFix(e.target.value)}
        />
      </div>

      {/* STATUS segmented control */}
      <div>
        <label className={labelClass}>Status</label>
        <div className="flex gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={[
                'flex-1 h-8 font-mono text-xs font-semibold rounded-md border transition-colors duration-100',
                status === s
                  ? 'bg-accent text-text-inverse border-accent'
                  : 'border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* SUBJECT dropdown */}
      <div>
        <label className={labelClass}>Subject</label>
        <select
          className={`${inputClass} cursor-pointer`}
          value={subjectId}
          onChange={(e) => setSubjectId(Number(e.target.value))}
        >
          {subjects.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        {mode === 'create' ? (
          <>
            <Button variant="primary" size="sm" loading={loading} onClick={handleCreate}>
              Create
            </Button>
            <Button variant="secondary" size="sm" disabled={loading} onClick={onClose}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="sm" loading={loading} onClick={handleSave}>
              Save
            </Button>
            <Button variant="danger" size="sm" disabled={loading} onClick={handleDelete}>
              Delete
            </Button>
            <Button variant="secondary" size="sm" disabled={loading} onClick={onClose}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ── WeakPointLog ──────────────────────────────────────────────────────────────

interface ModalState {
  open: boolean
  mode: 'create' | 'edit'
  // Pre-filled data for the modal (full weak point for edit, partial for create)
  initial: Partial<WeakPoint>
}

const CLOSED_MODAL: ModalState = { open: false, mode: 'create', initial: {} }

export default function WeakPointLog() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [allWeakPoints, setAllWeakPoints] = useState<WeakPointWithSubject[]>([])
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>(CLOSED_MODAL)

  // Fetch all subjects then all weak points in parallel per subject
  const fetchAll = useCallback(async () => {
    setLoading(true)

    const subjectsRes = await getSubjects()
    const subs = subjectsRes.subjects ?? []
    setSubjects(subs)

    if (subs.length === 0) {
      setAllWeakPoints([])
      setLoading(false)
      return
    }

    // Parallel fetch for all subjects
    const results = await Promise.all(
      subs.map(async (sub) => {
        const res = await getWeakPoints(sub.id)
        const points = res.weak_points ?? []
        // Enrich each weak point with the subject name
        return points.map((wp) => ({ ...wp, subjectName: sub.name }))
      })
    )

    // Flatten and sort by created_at DESC
    const merged = results.flat().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    setAllWeakPoints(merged)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Client-side filtering by selected subject
  const filtered: WeakPointWithSubject[] =
    selectedSubjectId === 'all'
      ? allWeakPoints
      : allWeakPoints.filter((wp) => wp.subject_id === selectedSubjectId)

  // Group by status for the stacked kanban sections
  const grouped: Record<Status, WeakPointWithSubject[]> = {
    Open: [],
    Patched: [],
    Confirmed: [],
  }
  for (const wp of filtered) {
    const s = wp.status as Status
    if (s in grouped) grouped[s].push(wp)
  }

  const handleModalSuccess = () => {
    setModal(CLOSED_MODAL)
    fetchAll()
  }

  const openCreate = (prefilledStatus: Status) => {
    // Default subject_id to the first subject, or the filtered one if a subject is selected
    const defaultSubjectId =
      selectedSubjectId !== 'all' ? selectedSubjectId : (subjects[0]?.id ?? 0)
    setModal({
      open: true,
      mode: 'create',
      initial: { status: prefilledStatus, subject_id: defaultSubjectId },
    })
  }

  const openEdit = (wp: WeakPointWithSubject) => {
    setModal({ open: true, mode: 'edit', initial: wp })
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Subject filter */}
      <div>
        <SectionLabel className="mb-2">Filter by Subject</SectionLabel>
        <select
          className="w-full bg-bg-base border border-border-default rounded-md px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent transition-colors duration-100"
          value={selectedSubjectId === 'all' ? 'all' : String(selectedSubjectId)}
          onChange={(e) =>
            setSelectedSubjectId(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
        >
          <option value="all">ALL SUBJECTS</option>
          {subjects.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {loading && (
        <p className="text-text-muted text-xs font-mono text-center py-4">Loading…</p>
      )}

      {/* Stacked kanban sections */}
      {!loading &&
        STATUSES.map((status) => (
          <section key={status}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[status]}>{status}</Badge>
                <span className="font-mono text-xs text-text-muted">
                  {grouped[status].length}
                </span>
              </div>
              <button
                onClick={() => openCreate(status)}
                aria-label={`Add ${status} weak point`}
                className="w-5 h-5 flex items-center justify-center rounded border border-border-default text-text-muted hover:text-text-primary hover:border-border-strong transition-colors duration-100 font-mono text-xs leading-none"
              >
                +
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-border-default mb-2" />

            {/* Cards */}
            {grouped[status].length === 0 ? (
              <p className="text-text-muted text-xs font-mono px-1 pb-2">No entries.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {grouped[status].map((wp) => (
                  <ErrorCard key={wp.id} wp={wp} onClick={() => openEdit(wp)} />
                ))}
              </div>
            )}
          </section>
        ))}

      {/* Create / Edit modal */}
      <Modal isOpen={modal.open} onClose={() => setModal(CLOSED_MODAL)} maxWidth="md">
        {modal.open && (
          <ErrorCardModal
            mode={modal.mode}
            initial={modal.initial}
            subjects={subjects}
            onClose={() => setModal(CLOSED_MODAL)}
            onSuccess={handleModalSuccess}
          />
        )}
      </Modal>
    </div>
  )
}
