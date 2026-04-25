/**
 * POST /api/ai/quiz-weak-points
 *
 * Accepts a list of wrong quiz answers, sends them to Gemini in a single prompt,
 * and returns a why_missed explanation for each question.
 *
 * This route is AI-only — it does NOT write to the DB. The caller is responsible
 * for persisting weak points via POST /api/subjects/:subjectId/weak-points/bulk.
 */

import { Router, Request, Response } from 'express'
import { GoogleGenAI } from '@google/genai'

const router = Router()

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// ── Types ──────────────────────────────────────────────────────────────────────

interface WrongAnswerInput {
  id: string
  question: string
  correctAnswer: string
  userAnswer: string
  topic: string
}

interface WhyMissedResult {
  id: string
  why_missed: string
}

// ── Route ──────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// POST /api/ai/quiz-weak-points
// Body: { questions: WrongAnswerInput[] }
// Returns: { results: WhyMissedResult[] }
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  const { questions } = req.body as { questions?: unknown }

  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'questions must be a non-empty array' })
    return
  }

  if (questions.length > 50) {
    res.status(400).json({ error: 'questions array exceeds maximum of 50 items' })
    return
  }

  // Validate each entry has the required fields.
  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx] as Record<string, unknown>
    if (typeof q.id !== 'string' || q.id.trim() === '') {
      res.status(400).json({ error: `questions[${idx}].id is required` })
      return
    }
    if (typeof q.question !== 'string' || q.question.trim() === '') {
      res.status(400).json({ error: `questions[${idx}].question is required` })
      return
    }
    if (typeof q.correctAnswer !== 'string' || q.correctAnswer.trim() === '') {
      res.status(400).json({ error: `questions[${idx}].correctAnswer is required` })
      return
    }
    if (typeof q.userAnswer !== 'string') {
      res.status(400).json({ error: `questions[${idx}].userAnswer is required` })
      return
    }
    if (typeof q.topic !== 'string' || q.topic.trim() === '') {
      res.status(400).json({ error: `questions[${idx}].topic is required` })
      return
    }
  }

  const typedQuestions = questions as WrongAnswerInput[]

  // Build a numbered list so Gemini has a clear structure to respond to.
  const questionList = typedQuestions
    .map((q, idx) =>
      `${idx + 1}. [id: ${q.id}]\n   Topic: ${q.topic}\n   Question: ${q.question}\n   Correct answer: ${q.correctAnswer}\n   Student answered: ${q.userAnswer || '(no answer given)'}`
    )
    .join('\n\n')

  const systemInstruction = `You are a study assistant analyzing a student's quiz mistakes.
For each question provided, generate a concise 1-2 sentence explanation of why the student
likely missed it, based on their wrong answer and the correct one.
Return a JSON array ONLY — no prose, no markdown fences, no extra text before or after.
Each object in the array must have exactly two keys: "id" (string, copied verbatim from input) and "why_missed" (string).
The array must contain one entry per question, in the same order as the input.`

  const userMessage = `Analyze these wrong quiz answers and explain why each was missed:\n\n${questionList}`

  // 30-second hard timeout on the Gemini call.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: { systemInstruction },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })

    clearTimeout(timeout)

    const rawText = response.text ?? ''

    // Strip markdown code fences if Gemini wraps the JSON anyway.
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let results: WhyMissedResult[]
    try {
      results = JSON.parse(cleaned) as WhyMissedResult[]
    } catch {
      console.error('[ai-weak-points] Failed to parse Gemini response as JSON:', rawText)
      res.status(502).json({ error: 'AI response was not valid JSON. Please try again.' })
      return
    }

    if (!Array.isArray(results)) {
      res.status(502).json({ error: 'AI response was not an array. Please try again.' })
      return
    }

    // Ensure every input question has a corresponding result — fill gaps with a
    // fallback so the caller never receives fewer items than it sent.
    const resultMap = new Map(results.map((r) => [r.id, r.why_missed]))
    const safeResults: WhyMissedResult[] = typedQuestions.map((q) => ({
      id: q.id,
      why_missed: resultMap.get(q.id) ?? 'Could not determine reason — review this topic manually.',
    }))

    res.json({ results: safeResults })
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      res.status(504).json({ error: 'AI generation timed out. Please try again.' })
      return
    }
    console.error('[ai-weak-points] POST / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
