import { Router, Request, Response } from 'express'
import db from '../db/index'

const router = Router()

// ---------------------------------------------------------------------------
// GET /api/tasks — all tasks across subjects, ordered by due_date ASC.
// Includes subject name via LEFT JOIN.
// ---------------------------------------------------------------------------
router.get('/', (_req: Request, res: Response) => {
  try {
    const tasks = db.prepare(`
      SELECT t.id, t.subject_id, t.title, t.due_date, t.completed,
             s.name as subject_name
      FROM tasks t
      LEFT JOIN subjects s ON s.id = t.subject_id
      ORDER BY t.due_date ASC
    `).all()
    res.json({ tasks })
  } catch (err) {
    console.error('[tasks] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/tasks — create a new task. subject_id is optional.
// ---------------------------------------------------------------------------
router.post('/', (req: Request, res: Response) => {
  const { title, due_date, subject_id } = req.body as {
    title?: unknown
    due_date?: unknown
    subject_id?: unknown
  }

  if (typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' })
    return
  }

  if (typeof due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    res.status(400).json({ error: 'due_date must be YYYY-MM-DD' })
    return
  }

  // subject_id is optional — must be a positive integer if provided
  if (subject_id !== undefined && subject_id !== null) {
    if (!Number.isInteger(subject_id) || (subject_id as number) <= 0) {
      res.status(400).json({ error: 'subject_id must be a positive integer or null' })
      return
    }
  }

  try {
    // If subject_id provided, verify the subject exists
    if (subject_id != null) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subject_id as number)
      if (!subject) {
        res.status(400).json({ error: 'subject not found' })
        return
      }
    }

    const resolvedSubjectId: number | null = (subject_id != null ? subject_id as number : null)
    const result = db.prepare(
      'INSERT INTO tasks (subject_id, title, due_date) VALUES (?, ?, ?)'
    ).run(resolvedSubjectId, title.trim(), due_date)

    const task = db.prepare(`
      SELECT t.id, t.subject_id, t.title, t.due_date, t.completed,
             s.name as subject_name
      FROM tasks t
      LEFT JOIN subjects s ON s.id = t.subject_id
      WHERE t.id = ?
    `).get(result.lastInsertRowid as number)

    res.status(201).json({ task })
  } catch (err) {
    console.error('[tasks] POST / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id — update any combination of title, due_date, completed,
// subject_id. At least one field required.
// ---------------------------------------------------------------------------
router.patch('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const body = req.body as {
    title?: unknown
    due_date?: unknown
    completed?: unknown
    subject_id?: unknown
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      res.status(400).json({ error: 'title must be a non-empty string' })
      return
    }
    updates.push('title = ?')
    values.push(body.title.trim())
  }

  if (body.due_date !== undefined) {
    if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      res.status(400).json({ error: 'due_date must be YYYY-MM-DD' })
      return
    }
    updates.push('due_date = ?')
    values.push(body.due_date)
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      res.status(400).json({ error: 'completed must be a boolean' })
      return
    }
    updates.push('completed = ?')
    values.push(body.completed ? 1 : 0)
  }

  if (body.subject_id !== undefined) {
    if (body.subject_id !== null && (!Number.isInteger(body.subject_id) || (body.subject_id as number) <= 0)) {
      res.status(400).json({ error: 'subject_id must be a positive integer or null' })
      return
    }
    updates.push('subject_id = ?')
    values.push(body.subject_id)
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'at least one field required' })
    return
  }

  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    values.push(id)
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...(values as Parameters<typeof db.prepare>[0][]))
    res.json({ task: { id } })
  } catch (err) {
    console.error('[tasks] PATCH /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id — 404 guard then delete.
// ---------------------------------------------------------------------------
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    res.json({ deleted: true })
  } catch (err) {
    console.error('[tasks] DELETE /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// Subject-scoped tasks — mounted at /api/subjects/:subjectId/tasks
// ---------------------------------------------------------------------------
export const subjectTasks = Router({ mergeParams: true })

// GET /api/subjects/:subjectId/tasks
subjectTasks.get('/', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)
    if (!subject) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const tasks = db.prepare(
      'SELECT id, subject_id, title, due_date, completed FROM tasks WHERE subject_id = ? ORDER BY due_date ASC'
    ).all(subjectId)
    res.json({ tasks })
  } catch (err) {
    console.error('[tasks] GET /subjects/:id/tasks error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/subjects/:subjectId/tasks
subjectTasks.post('/', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)
  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { title, due_date } = req.body as { title?: unknown; due_date?: unknown }

  if (typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' })
    return
  }

  if (typeof due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
    res.status(400).json({ error: 'due_date must be YYYY-MM-DD' })
    return
  }

  try {
    const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)
    if (!subject) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const result = db.prepare(
      'INSERT INTO tasks (subject_id, title, due_date) VALUES (?, ?, ?)'
    ).run(subjectId, title.trim(), due_date)

    const task = db.prepare('SELECT id, subject_id, title, due_date, completed FROM tasks WHERE id = ?')
      .get(result.lastInsertRowid as number)

    res.status(201).json({ task })
  } catch (err) {
    console.error('[tasks] POST /subjects/:id/tasks error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
