import { useState, useEffect, type FormEvent } from 'react'
import { getTasks, createTask, updateTask, deleteTask, getSubjects, type Task, type Subject } from '../../lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdueOrToday(dueDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 1) // include today
  const due = new Date(dueDate)
  return due < cutoff
}

// ---------------------------------------------------------------------------
// AddTaskForm — inline form shown when "+ Add Task" is clicked
// ---------------------------------------------------------------------------

interface AddTaskFormProps {
  subjects: Subject[]
  onSaved: () => void
  onCancel: () => void
}

function AddTaskForm({ subjects, onSaved, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subjectId, setSubjectId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!dueDate) { setError('Due date is required.'); return }

    setLoading(true)
    setError(null)
    try {
      const result = await createTask({
        title: title.trim(),
        due_date: dueDate,
        ...(subjectId !== '' ? { subject_id: subjectId } : {}),
      })
      if ('error' in result) throw new Error(result.error)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border-b border-border-default flex flex-col gap-2 bg-bg-elevated">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        autoFocus
        className="h-8 px-2 rounded bg-bg-subtle border border-border-default text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="h-8 px-2 rounded bg-bg-subtle border border-border-default text-text-primary text-xs focus:outline-none focus:border-border-strong transition-colors"
      />
      <select
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value === '' ? '' : Number(e.target.value))}
        className="h-8 px-2 rounded bg-bg-subtle border border-border-default text-text-secondary text-xs focus:outline-none focus:border-border-strong transition-colors"
      >
        <option value="">No subject</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {error && <p className="text-error text-xs font-mono">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="text-xs bg-accent text-white px-2 py-1 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// TaskRow — single task with checkbox, title, due date, subject badge, delete
// ---------------------------------------------------------------------------

interface TaskRowProps {
  task: Task
  onToggle: (id: number, completed: boolean) => void
  onDelete: (id: number) => void
}

function TaskRow({ task, onToggle, onDelete }: TaskRowProps) {
  const overdue = !task.completed && isOverdueOrToday(task.due_date)

  return (
    <div className="group flex items-start gap-2 px-3 py-2 hover:bg-bg-elevated transition-colors duration-100">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task.id, !task.completed)}
        className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-xs ${task.completed ? 'line-through text-text-muted' : 'text-text-primary'}`}>
          {task.title}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-mono text-[10px] ${overdue ? 'text-error' : 'text-text-muted'}`}>
            {task.due_date}
          </span>
          {task.subject_name && (
            <span className="font-mono text-[10px] bg-bg-subtle text-text-muted px-1 py-0.5 rounded-sm">
              {task.subject_name}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onDelete(task.id)}
        aria-label={`Delete ${task.title}`}
        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error text-xs transition-opacity shrink-0 p-0.5"
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TaskTracker
// ---------------------------------------------------------------------------

export default function TaskTracker() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const fetchData = async () => {
    try {
      const [{ tasks: t }, { subjects: s }] = await Promise.all([getTasks(), getSubjects()])
      setTasks(t)
      setSubjects(s)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleToggle = async (id: number, completed: boolean) => {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed } : t))
    try {
      await updateTask(id, { completed })
    } catch {
      // Revert on failure
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !completed } : t))
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this task?')) return
    const prev = tasks
    setTasks((t) => t.filter((x) => x.id !== id))
    try {
      await deleteTask(id)
    } catch {
      setTasks(prev)
    }
  }

  const pending = tasks.filter((t) => !t.completed)
  const done = tasks.filter((t) => t.completed)

  if (loading) {
    return (
      <div className="p-3 flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded bg-bg-elevated animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-error text-xs font-mono p-3">{error}</p>
  }

  return (
    <div className="flex flex-col">
      {/* Add task button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-text-secondary text-xs hover:text-text-primary hover:bg-bg-elevated transition-colors duration-100 border-b border-border-default"
        >
          <span className="text-base leading-none">+</span>
          <span>Add Task</span>
        </button>
      ) : (
        <AddTaskForm
          subjects={subjects}
          onSaved={() => { setShowForm(false); fetchData() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {tasks.length === 0 && (
        <p className="text-text-muted text-xs font-mono p-3">No tasks yet.</p>
      )}

      {/* Pending tasks */}
      {pending.map((t) => (
        <TaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />
      ))}

      {/* Completed tasks — visually separated */}
      {done.length > 0 && (
        <>
          <div className="mx-3 mt-2 mb-1 border-t border-border-default" />
          <p className="px-3 pb-1 text-[10px] font-mono uppercase tracking-widest text-text-muted">Done</p>
          {done.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </>
      )}
    </div>
  )
}
