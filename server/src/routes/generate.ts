/**
 * AI generation routes.
 *
 * POST /api/modules/:moduleId/generate  — single-module generation (SSE)
 * POST /api/generate/multi-module-quiz  — stub (separate task)
 * POST /api/outputs/:outputId/regenerate — regenerate with instructions (SSE)
 */

import { Router, Request, Response } from 'express'
import db from '../db/index'
import { streamGeneration, extractText } from '../services/claude'

// ── Type guards ────────────────────────────────────────────────────────────────

type OutputType = 'prescan' | 'notes' | 'quiz'
const VALID_OUTPUT_TYPES: OutputType[] = ['prescan', 'notes', 'quiz']

function isValidOutputType(value: unknown): value is OutputType {
  return typeof value === 'string' && VALID_OUTPUT_TYPES.includes(value as OutputType)
}

// ── DB row types ───────────────────────────────────────────────────────────────

interface ModuleRow {
  id: number
  subject_id: number
  title: string
  file_path: string
  file_type: 'pdf' | 'docx'
  created_at: string
}

interface OutputRow {
  id: number
  module_id: number
  output_type: OutputType
  content: string
  instructions: string | null
  created_at: string
  updated_at: string
}

// ── Shared helper: upsert ai_outputs after stream ─────────────────────────────

/**
 * Upsert the generated content into ai_outputs.
 * If a row already exists for (module_id, output_type), update it.
 * Otherwise insert a new row.
 */
function upsertOutput(
  moduleId: number,
  outputType: OutputType,
  content: string,
  instructions: string | null
): void {
  const now = new Date().toISOString()

  const existing = db.prepare(
    'SELECT id FROM ai_outputs WHERE module_id = ? AND output_type = ?'
  ).get(moduleId, outputType) as { id: number } | undefined

  if (existing) {
    db.prepare(
      'UPDATE ai_outputs SET content = ?, instructions = ?, updated_at = ? WHERE id = ?'
    ).run(content, instructions, now, existing.id)
  } else {
    db.prepare(
      `INSERT INTO ai_outputs (module_id, output_type, content, instructions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(moduleId, outputType, content, instructions, now, now)
  }
}

// ── POST /api/modules/:moduleId/generate ─────────────────────────────────────

const router = Router({ mergeParams: true })

router.post('/', async (req: Request, res: Response) => {
  const moduleId = Number(req.params.moduleId)
  if (!Number.isInteger(moduleId) || moduleId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { output_type, question_count, instructions } = req.body as {
    output_type?: unknown
    question_count?: unknown
    instructions?: unknown
  }

  // Validate output_type
  if (!isValidOutputType(output_type)) {
    res.status(400).json({ error: 'invalid output_type' })
    return
  }

  // quiz requires a question count
  if (output_type === 'quiz') {
    const count = Number(question_count)
    if (!Number.isInteger(count) || count < 1) {
      res.status(400).json({ error: 'question_count required for quiz' })
      return
    }
  }

  // Fetch module
  const module = db.prepare(
    'SELECT id, subject_id, title, file_path, file_type, created_at FROM modules WHERE id = ?'
  ).get(moduleId) as ModuleRow | undefined

  if (!module) {
    res.status(404).json({ error: 'not found' })
    return
  }

  // Extract text from the uploaded file
  let text: string
  try {
    text = await extractText(module.file_path, module.file_type)
  } catch (err) {
    console.error('[generate] extractText error:', err instanceof Error ? err.message : err)
    res.status(422).json({ error: 'could not extract file content' })
    return
  }

  // Stream generation — after flushHeaders() inside streamGeneration, we can
  // no longer send JSON error responses. All errors are handled inside the
  // streamGeneration function itself via SSE error events.
  let content: string
  try {
    content = await streamGeneration(res, {
      text,
      outputType: output_type,
      questionCount: typeof question_count === 'number' ? question_count : undefined,
      instructions: typeof instructions === 'string' ? instructions : undefined,
    })
  } catch {
    // streamGeneration does not rethrow — this branch is a safety net only.
    return
  }

  // Persist to DB after stream completes (res is already ended).
  // DB errors are logged but not surfaced to the client — stream is done.
  try {
    upsertOutput(
      moduleId,
      output_type,
      content,
      typeof instructions === 'string' ? instructions : null
    )
  } catch (err) {
    console.error('[generate] upsertOutput error:', err instanceof Error ? err.message : err)
  }
})

export default router

// ── POST /api/generate/multi-module-quiz ─────────────────────────────────────
// Stub — implemented in a separate task.

export const multiModuleQuiz = Router()
multiModuleQuiz.post('/multi-module-quiz', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'not implemented' })
})

// ── POST /api/outputs/:outputId/regenerate ───────────────────────────────────

export const regenerate = Router({ mergeParams: true })

regenerate.post('/', async (req: Request, res: Response) => {
  const outputId = Number(req.params.outputId)
  if (!Number.isInteger(outputId) || outputId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { instructions } = req.body as { instructions?: unknown }

  // Fetch existing output row
  const output = db.prepare(
    'SELECT id, module_id, output_type, content, instructions, created_at, updated_at FROM ai_outputs WHERE id = ?'
  ).get(outputId) as OutputRow | undefined

  if (!output) {
    res.status(404).json({ error: 'not found' })
    return
  }

  // Fetch the parent module to get the file path
  const module = db.prepare(
    'SELECT id, subject_id, title, file_path, file_type, created_at FROM modules WHERE id = ?'
  ).get(output.module_id) as ModuleRow | undefined

  if (!module) {
    res.status(404).json({ error: 'module not found' })
    return
  }

  // Extract text from the file
  let text: string
  try {
    text = await extractText(module.file_path, module.file_type)
  } catch (err) {
    console.error('[regenerate] extractText error:', err instanceof Error ? err.message : err)
    res.status(422).json({ error: 'could not extract file content' })
    return
  }

  // Parse question_count from the original output's content if it was a quiz.
  // We don't have a separate column for this, so we attempt to parse the JSON
  // and count entries; fall back to 10 if parsing fails.
  let questionCount: number | undefined
  if (output.output_type === 'quiz') {
    try {
      const parsed = JSON.parse(output.content) as unknown[]
      questionCount = Array.isArray(parsed) ? parsed.length : 10
    } catch {
      questionCount = 10
    }
  }

  // Stream regeneration
  let content: string
  try {
    content = await streamGeneration(res, {
      text,
      outputType: output.output_type,
      questionCount,
      instructions: typeof instructions === 'string' ? instructions : undefined,
    })
  } catch {
    return
  }

  // Update the existing output row
  try {
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE ai_outputs SET content = ?, instructions = ?, updated_at = ? WHERE id = ?'
    ).run(
      content,
      typeof instructions === 'string' ? instructions : output.instructions,
      now,
      outputId
    )
  } catch (err) {
    console.error('[regenerate] DB update error:', err instanceof Error ? err.message : err)
  }
})
