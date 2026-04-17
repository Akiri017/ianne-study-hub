import { Router, Request, Response } from 'express'
import db from '../db/index'

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_STATUSES = ['Open', 'Patched', 'Confirmed'] as const
type Status = typeof VALID_STATUSES[number]

// ── Standalone router — PATCH /:id, DELETE /:id ───────────────────────────────

const router = Router()

// ---------------------------------------------------------------------------
// PATCH /api/weak-points/:id
// Body: partial { topic?, what_went_wrong?, why_missed?, fix?, status? }
// At least one field required. Updates updated_at to now.
// ---------------------------------------------------------------------------
router.patch('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { topic, what_went_wrong, why_missed, fix, status } = req.body as {
    topic?: unknown
    what_went_wrong?: unknown
    why_missed?: unknown
    fix?: unknown
    status?: unknown
  }

  // Validate status if provided
  if (status !== undefined && !VALID_STATUSES.includes(status as Status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    return
  }

  // Build dynamic SET clause — require at least one field
  const fields: string[] = []
  // SQLInputValue = string | number | bigint | ArrayBuffer | null
  const values: (string | number | null)[] = []

  if (topic !== undefined)           { fields.push('topic = ?');           values.push(String(topic)) }
  if (what_went_wrong !== undefined)  { fields.push('what_went_wrong = ?'); values.push(String(what_went_wrong)) }
  if (why_missed !== undefined)      { fields.push('why_missed = ?');      values.push(String(why_missed)) }
  if (fix !== undefined)             { fields.push('fix = ?');              values.push(String(fix)) }
  if (status !== undefined)          { fields.push('status = ?');           values.push(String(status)) }

  if (fields.length === 0) {
    res.status(400).json({ error: 'at least one field is required' })
    return
  }

  const now = new Date().toISOString()
  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  try {
    // Check existence first so we can give a proper 404
    const existing = db.prepare('SELECT id FROM weak_points WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare(
      `UPDATE weak_points SET ${fields.join(', ')} WHERE id = ?`
    ).run(...values)

    res.json({ weak_point: { id, updated_at: now } })
  } catch (err) {
    console.error('[weak-points] PATCH /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/weak-points/:id
// Returns 404 if not found.
// ---------------------------------------------------------------------------
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const existing = db.prepare('SELECT id FROM weak_points WHERE id = ?').get(id)
    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare('DELETE FROM weak_points WHERE id = ?').run(id)
    res.json({ deleted: true })
  } catch (err) {
    console.error('[weak-points] DELETE /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Subject-scoped router — GET /, POST / ────────────────────────────────────
// Mounted at /api/subjects/:subjectId/weak-points with mergeParams so we can
// read req.params.subjectId.

export const subjectWeakPoints = Router({ mergeParams: true })

// ---------------------------------------------------------------------------
// GET /api/subjects/:subjectId/weak-points[?status=Open|Patched|Confirmed]
// Returns all weak points for the given subject, optionally filtered by status.
// ---------------------------------------------------------------------------
subjectWeakPoints.get('/', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(400).json({ error: 'invalid subjectId' })
    return
  }

  const { status } = req.query as { status?: unknown }

  if (status !== undefined && !VALID_STATUSES.includes(status as Status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    return
  }

  try {
    let rows: unknown[]

    if (status) {
      rows = db.prepare(
        `SELECT id, subject_id, topic, what_went_wrong, why_missed, fix, status, created_at, updated_at
         FROM weak_points WHERE subject_id = ? AND status = ? ORDER BY created_at DESC`
      ).all(subjectId, status as string)
    } else {
      rows = db.prepare(
        `SELECT id, subject_id, topic, what_went_wrong, why_missed, fix, status, created_at, updated_at
         FROM weak_points WHERE subject_id = ? ORDER BY created_at DESC`
      ).all(subjectId)
    }

    res.json({ weak_points: rows })
  } catch (err) {
    console.error('[weak-points] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/subjects/:subjectId/weak-points
// Body: { topic, what_went_wrong, why_missed, fix, status? }
// status defaults to 'Open'.
// ---------------------------------------------------------------------------
subjectWeakPoints.post('/', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(400).json({ error: 'invalid subjectId' })
    return
  }

  const { topic, what_went_wrong, why_missed, fix, status } = req.body as {
    topic?: unknown
    what_went_wrong?: unknown
    why_missed?: unknown
    fix?: unknown
    status?: unknown
  }

  // All required fields must be non-empty strings
  if (typeof topic !== 'string' || topic.trim() === '') {
    res.status(400).json({ error: 'topic is required' })
    return
  }
  if (typeof what_went_wrong !== 'string' || what_went_wrong.trim() === '') {
    res.status(400).json({ error: 'what_went_wrong is required' })
    return
  }
  if (typeof why_missed !== 'string' || why_missed.trim() === '') {
    res.status(400).json({ error: 'why_missed is required' })
    return
  }
  if (typeof fix !== 'string' || fix.trim() === '') {
    res.status(400).json({ error: 'fix is required' })
    return
  }

  const resolvedStatus: Status = (status as Status) ?? 'Open'

  if (!VALID_STATUSES.includes(resolvedStatus)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` })
    return
  }

  const now = new Date().toISOString()

  try {
    const result = db.prepare(
      `INSERT INTO weak_points (subject_id, topic, what_went_wrong, why_missed, fix, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(subjectId, topic.trim(), what_went_wrong.trim(), why_missed.trim(), fix.trim(), resolvedStatus, now, now)

    const weakPoint = db.prepare(
      `SELECT id, subject_id, topic, what_went_wrong, why_missed, fix, status, created_at, updated_at
       FROM weak_points WHERE id = ?`
    ).get(result.lastInsertRowid as number)

    res.status(201).json({ weak_point: weakPoint })
  } catch (err) {
    console.error('[weak-points] POST / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
