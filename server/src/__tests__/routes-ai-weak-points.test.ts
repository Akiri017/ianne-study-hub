/**
 * Express route tests — AI weak-points router.
 *
 * Strategy: vi.mock('@google/genai') replaces the SDK so we never hit the
 * real Gemini API. Each test configures mockGenerateContent independently.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── SDK mock — must be hoisted so the module factory can reference it ─────────

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    return {
      models: {
        generateContent: mockGenerateContent,
      },
    }
  }),
}))

import aiWeakPointsRouter from '../routes/ai-weak-points'

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/ai/quiz-weak-points', aiWeakPointsRouter)
    app.use(errorHandler)

    server = app.listen(0, () => {
      const addr = server.address() as { port: number }
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

afterAll(() => {
  return new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  vi.resetAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const validQuestion = {
  id: 'uuid-1',
  question: 'Who coined the sociological imagination?',
  correctAnswer: 'C. Wright Mills',
  userAnswer: 'Friedrich Engels',
  topic: 'Sociological Consciousness',
}

function makeGeminiResponse(text: string) {
  return { text }
}

// ── POST /api/ai/quiz-weak-points ─────────────────────────────────────────────

describe('POST /api/ai/quiz-weak-points', () => {
  it('returns 200 with results array on valid questions', async () => {
    const geminiResult = [{ id: 'uuid-1', why_missed: 'Confused similar theorists.' }]
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(JSON.stringify(geminiResult)))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { results: Array<{ id: string; why_missed: string }> }
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].id).toBe('uuid-1')
    expect(typeof body.results[0].why_missed).toBe('string')
    expect(body.results[0].why_missed.length).toBeGreaterThan(0)
  })

  it('strips markdown fences from Gemini response if present', async () => {
    const geminiResult = [{ id: 'uuid-1', why_missed: 'Confused similar theorists.' }]
    const fenced = `\`\`\`json\n${JSON.stringify(geminiResult)}\n\`\`\``
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(fenced))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { results: Array<{ id: string; why_missed: string }> }
    expect(body.results[0].why_missed).toBe('Confused similar theorists.')
  })

  it('fills in fallback why_missed when Gemini omits an id', async () => {
    // Gemini returns result for a different id than the input
    const geminiResult = [{ id: 'different-uuid', why_missed: 'Some explanation.' }]
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(JSON.stringify(geminiResult)))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { results: Array<{ id: string; why_missed: string }> }
    // The original uuid-1 should still appear with a fallback message
    expect(body.results[0].id).toBe('uuid-1')
    expect(body.results[0].why_missed).toMatch(/manually/)
  })

  it('returns 502 when Gemini response is not valid JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse('not json at all'))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(502)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/not valid JSON/)
  })

  it('returns 502 when Gemini response is JSON but not an array', async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(JSON.stringify({ id: 'uuid-1', why_missed: 'oops' })))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(502)
  })

  it('returns 400 when questions is missing', async () => {
    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/non-empty array/)
  })

  it('returns 400 when questions is empty', async () => {
    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [] }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when a question is missing id', async () => {
    const { id: _id, ...noId } = validQuestion
    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [noId] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/\.id is required/)
  })

  it('returns 400 when a question is missing correctAnswer', async () => {
    const { correctAnswer: _ca, ...noCorrect } = validQuestion
    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [noCorrect] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/correctAnswer/)
  })

  it('returns 400 when array exceeds 50 items', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ ...validQuestion, id: `uuid-${i}` }))
    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: items }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/maximum of 50/)
  })

  it('returns 500 when Gemini throws an unexpected error', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('network failure'))

    const res = await fetch(`${baseUrl}/api/ai/quiz-weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [validQuestion] }),
    })
    expect(res.status).toBe(500)
  })
})
