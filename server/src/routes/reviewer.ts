/**
 * Reviewer export route.
 * POST /api/subjects/:subjectId/reviewer/export
 *
 * Generates a structured study reviewer from all weak points
 * for a subject, then exports it as DOCX or PDF via Gemini + exporter service.
 */

import { Router, Request, Response } from 'express'
import { GoogleGenAI } from '@google/genai'
import db from '../db/index'
import { buildReviewerDocx, buildReviewerPdf } from '../services/exporter'

const router = Router({ mergeParams: true })

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// ---------------------------------------------------------------------------
// Weak point row type
// ---------------------------------------------------------------------------

interface WeakPointRow {
  id: number
  topic: string
  what_went_wrong: string
  why_missed: string
  fix: string
  created_at: string
}

// ---------------------------------------------------------------------------
// POST /export
// ---------------------------------------------------------------------------

router.post('/export', async (req: Request, res: Response) => {
  const subjectId = Number((req.params as Record<string, string>).subjectId)
  const { format = 'docx' } = req.body as { format?: 'docx' | 'pdf' }

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'Subject not found.' })
    return
  }

  if (format !== 'docx' && format !== 'pdf') {
    res.status(400).json({ error: 'format must be "docx" or "pdf".' })
    return
  }

  try {
    // Confirm the subject exists so we can return a proper 404
    const subject = db
      .prepare('SELECT id, name FROM subjects WHERE id = ?')
      .get(subjectId) as { id: number; name: string } | undefined

    if (!subject) {
      res.status(404).json({ error: 'Subject not found.' })
      return
    }

    // Fetch all weak points for this subject, oldest first
    const weakPoints = db
      .prepare(
        `SELECT id, topic, what_went_wrong, why_missed, fix, created_at
         FROM weak_points
         WHERE subject_id = ?
         ORDER BY created_at ASC`
      )
      .all(subjectId) as unknown as WeakPointRow[]

    if (weakPoints.length === 0) {
      res.status(400).json({ error: 'No weak points to export.' })
      return
    }

    // Build the prompt — describe each weak point so Gemini can produce a
    // structured explanation and remediation guide.
    const weakPointsText = weakPoints
      .map(
        (wp, i) =>
          `[Weak Point ${i + 1}]\n` +
          `Topic: ${wp.topic}\n` +
          `What went wrong: ${wp.what_went_wrong}\n` +
          `Why missed: ${wp.why_missed}\n` +
          `How to fix/remember: ${wp.fix}`
      )
      .join('\n\n')

    const systemInstruction = `You are a study assistant that generates structured reviewer documents.
Given a list of confirmed weak points from a student's study session, produce a study reviewer in Markdown.
For each weak point: explain the core concept clearly, describe what went wrong and why, then provide a focused explanation of how to fix or remember it.
Use ## headings for each weak point topic. Use ### for sub-sections (Concept, What Went Wrong, Why Missed, How to Fix).
Write in clear, concise academic prose. Output Markdown only — no code blocks wrapping the entire output.`

    const userMessage =
      `Generate a study reviewer for the subject "${subject.name}" based on these confirmed weak points:\n\n` +
      weakPointsText

    // Race Gemini against a 30s hard timeout — SDK doesn't accept a signal directly
    const generatePromise = ai.models.generateContent({
      model: MODEL,
      config: { systemInstruction },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Generation timed out after 30s')), 30_000)
    )

    const response = await Promise.race([generatePromise, timeoutPromise])
    const reviewerMarkdown = response.text ?? ''

    if (!reviewerMarkdown.trim()) {
      res.status(500).json({ error: 'AI generation returned empty content.' })
      return
    }

    const docTitle = `${subject.name} — Study Reviewer`
    const safeFilename = subject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()

    if (format === 'pdf') {
      const pdfBuffer = buildReviewerPdf(docTitle, reviewerMarkdown)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_reviewer.pdf"`)
      res.send(pdfBuffer)
    } else {
      const docxBuffer = await buildReviewerDocx(docTitle, reviewerMarkdown)
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}_reviewer.docx"`)
      res.send(docxBuffer)
    }
  } catch (err) {
    console.error('[reviewer] POST /export error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
  const subjectId = Number((req.params as Record<string, string>).subjectId)

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'Subject not found.' })
    return
  }

  try {
    const subject = db
      .prepare('SELECT id, name FROM subjects WHERE id = ?')
      .get(subjectId) as { id: number; name: string } | undefined

    if (!subject) {
      res.status(404).json({ error: 'Subject not found.' })
      return
    }

    const weakPoints = db
      .prepare(
        `SELECT id, topic, what_went_wrong, why_missed, fix, created_at
         FROM weak_points
         WHERE subject_id = ?
         ORDER BY created_at ASC`
      )
      .all(subjectId) as unknown as WeakPointRow[]

    if (weakPoints.length === 0) {
      res.status(400).json({ error: 'No weak points to review.' })
      return
    }

    const weakPointsText = weakPoints
      .map(
        (wp, i) =>
          `[Weak Point ${i + 1}]\n` +
          `Topic: ${wp.topic}\n` +
          `What went wrong: ${wp.what_went_wrong}\n` +
          `Why missed: ${wp.why_missed}\n` +
          `How to fix/remember: ${wp.fix}`
      )
      .join('\n\n')

    const systemInstruction = `You are a study assistant that generates structured reviewer documents.
Given a list of confirmed weak points from a student's study session, produce a study reviewer in Markdown.
For each weak point: explain the core concept clearly, describe what went wrong and why, then provide a focused explanation of how to fix or remember it.
Use ## headings for each weak point topic. Use ### for sub-sections (Concept, What Went Wrong, Why Missed, How to Fix).
Write in clear, concise academic prose. Output Markdown only — no code blocks wrapping the entire output.`

    const userMessage =
      `Generate a study reviewer for the subject "${subject.name}" based on these confirmed weak points:\n\n` +
      weakPointsText

    const generatePromise = ai.models.generateContent({
      model: MODEL,
      config: { systemInstruction },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Generation timed out after 30s')), 30_000)
    )

    const response = await Promise.race([generatePromise, timeoutPromise])
    const reviewerMarkdown = response.text ?? ''

    if (!reviewerMarkdown.trim()) {
      res.status(500).json({ error: 'AI generation returned empty content.' })
      return
    }

    res.json({ content: reviewerMarkdown })
  } catch (err) {
    console.error('[reviewer] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
