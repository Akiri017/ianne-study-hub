import { Router, Request, Response } from 'express'
import db from '../db/index'

const router = Router()

// ---------------------------------------------------------------------------
// GET /api/quizzes/:id
// Returns the quiz with questions_json parsed to an array.
// ---------------------------------------------------------------------------
router.get('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const row = db.prepare(
      'SELECT id, title, question_count, questions_json, created_at FROM quizzes WHERE id = ?'
    ).get(id) as { id: number; title: string; question_count: number; questions_json: string; created_at: string } | undefined

    if (!row) {
      res.status(404).json({ error: 'not found' })
      return
    }

    let questions: unknown[]
    try {
      questions = JSON.parse(row.questions_json) as unknown[]
    } catch {
      res.status(500).json({ error: 'malformed quiz data' })
      return
    }

    // Resolve subject_id from the first linked module (multi-subject quizzes are rare;
    // we take the first one so the results screen can log weak points).
    const moduleLink = db.prepare(`
      SELECT m.subject_id
      FROM quiz_modules qm
      JOIN modules m ON m.id = qm.module_id
      WHERE qm.quiz_id = ?
      LIMIT 1
    `).get(id) as { subject_id: number } | undefined

    res.json({
      quiz: {
        id: row.id,
        title: row.title,
        question_count: row.question_count,
        questions,
        created_at: row.created_at,
        subject_id: moduleLink?.subject_id ?? null,
      },
    })
  } catch (err) {
    console.error('[quizzes] GET /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/quizzes/:id/sessions
// Creates a new fa_session for the given quiz.
// Body: (none required — session starts empty)
// Returns 201 { session: { id, quiz_id, score, total, answers_json, completed_at } }
// ---------------------------------------------------------------------------
router.post('/:id/sessions', (req: Request, res: Response) => {
  const quizId = Number(req.params.id)
  if (!Number.isInteger(quizId) || quizId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const quiz = db.prepare('SELECT id, question_count FROM quizzes WHERE id = ?').get(quizId) as
      | { id: number; question_count: number }
      | undefined

    if (!quiz) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const result = db.prepare(
      "INSERT INTO fa_sessions (quiz_id, score, total, answers_json) VALUES (?, 0, ?, '[]')"
    ).run(quizId, quiz.question_count)

    const session = db.prepare(
      'SELECT id, quiz_id, score, total, answers_json, completed_at FROM fa_sessions WHERE id = ?'
    ).get(result.lastInsertRowid as number)

    res.status(201).json({ session })
  } catch (err) {
    console.error('[quizzes] POST /:id/sessions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/quizzes/:id/sessions/:sessionId
// Returns a specific session.
// ---------------------------------------------------------------------------
router.get('/:id/sessions/:sessionId', (req: Request, res: Response) => {
  const quizId = Number(req.params.id)
  const sessionId = Number(req.params.sessionId)

  if (!Number.isInteger(quizId) || quizId <= 0 || !Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const session = db.prepare(
      'SELECT id, quiz_id, score, total, answers_json, completed_at FROM fa_sessions WHERE id = ? AND quiz_id = ?'
    ).get(sessionId, quizId)

    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.json({ session })
  } catch (err) {
    console.error('[quizzes] GET /:id/sessions/:sessionId error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/quizzes/:id/sessions/:sessionId
// Completes an fa_session — saves answers, score, and marks completed_at.
// Body: { score: number, answers: Array<{ question_id: string, user_answer: string, correct: boolean }> }
// ---------------------------------------------------------------------------
router.patch('/:id/sessions/:sessionId', (req: Request, res: Response) => {
  const quizId = Number(req.params.id)
  const sessionId = Number(req.params.sessionId)

  if (!Number.isInteger(quizId) || quizId <= 0 || !Number.isInteger(sessionId) || sessionId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const { score, answers } = req.body as { score?: unknown; answers?: unknown }

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0) {
    res.status(400).json({ error: 'score must be a non-negative integer' })
    return
  }

  if (!Array.isArray(answers)) {
    res.status(400).json({ error: 'answers must be an array' })
    return
  }

  try {
    const session = db.prepare(
      'SELECT id FROM fa_sessions WHERE id = ? AND quiz_id = ?'
    ).get(sessionId, quizId)

    if (!session) {
      res.status(404).json({ error: 'not found' })
      return
    }

    db.prepare(
      "UPDATE fa_sessions SET score = ?, answers_json = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    ).run(score, JSON.stringify(answers), sessionId)

    const updated = db.prepare(
      'SELECT id, quiz_id, score, total, answers_json, completed_at FROM fa_sessions WHERE id = ?'
    ).get(sessionId)

    res.json({ session: updated })
  } catch (err) {
    console.error('[quizzes] PATCH /:id/sessions/:sessionId error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// Subject-scoped quizzes — mounted at /api/subjects/:subjectId/quizzes
// Returns all quizzes that include at least one module from this subject.
// ---------------------------------------------------------------------------
export const subjectQuizzes = Router({ mergeParams: true })

subjectQuizzes.get('/', (req: Request, res: Response) => {
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

    // Find all quizzes that contain at least one module belonging to this subject
    const quizzes = db.prepare(`
      SELECT DISTINCT q.id, q.title, q.question_count, q.created_at
      FROM quizzes q
      JOIN quiz_modules qm ON qm.quiz_id = q.id
      JOIN modules m ON m.id = qm.module_id
      WHERE m.subject_id = ?
      ORDER BY q.created_at DESC
    `).all(subjectId)

    res.json({ quizzes })
  } catch (err) {
    console.error('[quizzes] GET /subjects/:id/quizzes error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
