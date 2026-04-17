/**
 * AI outputs routes.
 *
 * GET   /api/outputs/:id  — fetch a single ai_output record
 * PATCH /api/outputs/:id  — save inline edits to output content
 */

import { Router, Request, Response } from 'express'
import db from '../db/index'

const router = Router()

interface OutputRow {
  id: number
  module_id: number
  output_type: string
  content: string
  instructions: string | null
  created_at: string
  updated_at: string
}

// ── GET /api/outputs/:id ──────────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const output = db.prepare(
      `SELECT id, module_id, output_type, content, instructions, created_at, updated_at
       FROM ai_outputs WHERE id = ?`
    ).get(id) as OutputRow | undefined

    if (!output) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.json({ output })
  } catch (err) {
    console.error('[outputs] GET /:id error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PATCH /api/outputs/:id ────────────────────────────────────────────────────

router.patch('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { content } = req.body as { content?: unknown }

  // Content must be a non-empty string
  if (typeof content !== 'string' || content.trim() === '') {
    res.status(400).json({ error: 'content is required' })
    return
  }

  try {
    const existing = db.prepare(
      'SELECT id FROM ai_outputs WHERE id = ?'
    ).get(id) as { id: number } | undefined

    if (!existing) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const now = new Date().toISOString()
    db.prepare(
      'UPDATE ai_outputs SET content = ?, updated_at = ? WHERE id = ?'
    ).run(content, now, id)

    res.json({ output: { id, updated_at: now } })
  } catch (err) {
    console.error('[outputs] PATCH /:id error:', err instanceof Error ? err.message : err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
