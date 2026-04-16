import { Router, Request, Response } from 'express'
import db from '../db/index'

const router = Router()

// ---------------------------------------------------------------------------
// GET /api/subjects
// Returns all subjects ordered by creation time ascending.
// ---------------------------------------------------------------------------
router.get('/', (_req: Request, res: Response) => {
  try {
    const subjects = db.prepare(
      'SELECT id, name, created_at FROM subjects ORDER BY created_at ASC'
    ).all()
    res.json({ subjects })
  } catch (err) {
    console.error('[subjects] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/subjects
// Body: { name: string }
// Creates a new subject. Enforces non-empty name and UNIQUE constraint.
// ---------------------------------------------------------------------------
router.post('/', (req: Request, res: Response) => {
  const { name } = req.body as { name?: unknown }

  // Validate: name must be a non-empty string
  if (typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const trimmedName = name.trim()

  try {
    const result = db.prepare(
      'INSERT INTO subjects (name) VALUES (?)'
    ).run(trimmedName)

    // Fetch the newly created row so we return the real created_at from the DB
    const subject = db.prepare(
      'SELECT id, name, created_at FROM subjects WHERE id = ?'
    ).get(result.lastInsertRowid as number)

    res.status(201).json({ subject })
  } catch (err: unknown) {
    // SQLite UNIQUE constraint violation surfaces as an error with a message
    // containing 'UNIQUE constraint failed'
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'subject already exists' })
      return
    }
    console.error('[subjects] POST / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/subjects/:id
// Deletes a subject. FK cascade in schema handles modules, weak_points, tasks.
// Returns 404 if the subject doesn't exist.
// ---------------------------------------------------------------------------
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    // Verify existence before attempting delete so we can distinguish
    // "not found" from an actual DB error.
    const existing = db.prepare(
      'SELECT id FROM subjects WHERE id = ?'
    ).get(id)

    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare('DELETE FROM subjects WHERE id = ?').run(id)
    res.json({ deleted: true })
  } catch (err) {
    console.error('[subjects] DELETE /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
