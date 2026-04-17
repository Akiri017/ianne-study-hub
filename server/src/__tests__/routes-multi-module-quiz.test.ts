/**
 * Unit tests — POST /api/generate/multi-module-quiz
 *
 * Strategy: vi.mock both `../db/index` and `../services/claude` so we never
 * touch a real database or call the Gemini API. extractText and generateText
 * are mocked; db.prepare is mocked per-call via mockReturnValueOnce chains.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── Hoist mock references ────────────────────────────────────────────────────

const { mockExtractText, mockGenerateText } = vi.hoisted(() => ({
  mockExtractText: vi.fn(),
  mockGenerateText: vi.fn(),
}))

// ── DB mock ──────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

// ── Claude service mock ───────────────────────────────────────────────────────

vi.mock('../services/claude', () => ({
  streamGeneration: vi.fn(),
  extractText: mockExtractText,
  generateText: mockGenerateText,
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import db from '../db/index'
import { multiModuleQuiz } from '../routes/generate'

// ── Typed mock shorthand ──────────────────────────────────────────────────────

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Valid module rows for reuse in tests ─────────────────────────────────────

const MODULE_A = { id: 1, subject_id: 1, title: 'Module A', file_path: 'a.pdf', file_type: 'pdf', created_at: '2026-01-01' }
const MODULE_B = { id: 2, subject_id: 1, title: 'Module B', file_path: 'b.docx', file_type: 'docx', created_at: '2026-01-01' }

// Valid quiz JSON that generateText returns in happy-path scenarios
const VALID_QUIZ_JSON = JSON.stringify([
  { id: 'q1', type: 'mcq', question: 'Q?', choices: ['A', 'B', 'C', 'D'], answer: 'A', topic: 'T' },
])

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      const app = express()
      app.use(express.json())
      app.use('/api/generate', multiModuleQuiz)
      app.use(errorHandler)

      server = app.listen(0, () => {
        const addr = server.address() as { port: number }
        baseUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
    })
)

afterAll(
  () => new Promise<void>((resolve) => server.close(() => resolve()))
)

beforeEach(() => {
  vi.resetAllMocks()

  // Sensible defaults so individual tests only override what they care about
  mockExtractText.mockResolvedValue('extracted text')
  mockGenerateText.mockResolvedValue(VALID_QUIZ_JSON)
})

// ── Validation ───────────────────────────────────────────────────────────────

describe('POST /api/generate/multi-module-quiz — validation', () => {
  it('returns 400 when module_ids has fewer than 2 elements (empty array)', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [], question_count: 5 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('at least 2 module_ids required')
  })

  it('returns 400 when module_ids has exactly 1 element', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1], question_count: 5 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('at least 2 module_ids required')
  })

  it('returns 400 when module_ids is not an array', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: 1, question_count: 5 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('at least 2 module_ids required')
  })

  it('returns 400 when question_count is missing', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('question_count required')
  })

  it('returns 400 when question_count is 0', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 0 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('question_count required')
  })

  it('returns 400 when question_count is a string', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 'ten' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('question_count required')
  })
})

// ── 404 for missing modules ───────────────────────────────────────────────────

describe('POST /api/generate/multi-module-quiz — module not found', () => {
  it('returns 404 when the first module_id does not exist in DB', async () => {
    // First module lookup returns undefined
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [999, 2], question_count: 5 }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('one or more modules not found')
  })

  it('returns 404 when the second module_id does not exist in DB', async () => {
    // First module found, second missing
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_A) })
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 999], question_count: 5 }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('one or more modules not found')
  })
})

// ── 422 for bad generateText output ──────────────────────────────────────────

describe('POST /api/generate/multi-module-quiz — invalid AI output', () => {
  it('returns 422 when generateText returns non-JSON content', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_A) })
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_B) })
    mockGenerateText.mockResolvedValueOnce('This is not JSON at all.')

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 5 }),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('failed to parse quiz output')
  })

  it('returns 422 when generateText returns a JSON object (not array)', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_A) })
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_B) })
    mockGenerateText.mockResolvedValueOnce(JSON.stringify({ not: 'an array' }))

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 5 }),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('failed to parse quiz output')
  })
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/generate/multi-module-quiz — happy path', () => {
  /**
   * Sets up the full happy-path DB mock chain:
   *   - get() for MODULE_A
   *   - get() for MODULE_B
   *   - run() for INSERT quizzes
   *   - get() for last_insert_rowid()
   *   - run() for INSERT quiz_modules (MODULE_A)
   *   - run() for INSERT quiz_modules (MODULE_B)
   */
  function setupHappyPathMocks(quizId = 7) {
    const insertQuizRun = vi.fn()
    const insertModuleARun = vi.fn()
    const insertModuleBRun = vi.fn()

    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_A) })           // module A lookup
      .mockReturnValueOnce({ get: vi.fn(() => MODULE_B) })           // module B lookup
      .mockReturnValueOnce({ run: insertQuizRun })                   // INSERT quizzes
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: quizId })) })  // last_insert_rowid
      .mockReturnValueOnce({ run: insertModuleARun })                 // INSERT quiz_modules A
      .mockReturnValueOnce({ run: insertModuleBRun })                 // INSERT quiz_modules B

    return { insertQuizRun, insertModuleARun, insertModuleBRun }
  }

  it('returns 201 with { quiz_id, title, question_count } on success', async () => {
    setupHappyPathMocks(7)

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 1 }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { quiz_id: number; title: string; question_count: number }
    expect(body.quiz_id).toBe(7)
    expect(typeof body.title).toBe('string')
    expect(body.question_count).toBe(1)
  })

  it('auto-generates title when none provided', async () => {
    setupHappyPathMocks(7)

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 1 }),
    })

    const body = await res.json() as { quiz_id: number; title: string; question_count: number }
    // Auto-title should contain both module titles
    expect(body.title).toContain('Module A')
    expect(body.title).toContain('Module B')
  })

  it('uses provided title when given', async () => {
    setupHappyPathMocks(7)

    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 1, title: 'My Custom Quiz' }),
    })

    const body = await res.json() as { quiz_id: number; title: string; question_count: number }
    expect(body.title).toBe('My Custom Quiz')
  })

  it('inserts one row into quizzes (db.prepare called for INSERT)', async () => {
    const { insertQuizRun } = setupHappyPathMocks(7)

    await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 1 }),
    })

    expect(insertQuizRun).toHaveBeenCalledOnce()
  })

  it('inserts N rows into quiz_modules (one per module)', async () => {
    const { insertModuleARun, insertModuleBRun } = setupHappyPathMocks(7)

    await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 1 }),
    })

    expect(insertModuleARun).toHaveBeenCalledOnce()
    expect(insertModuleBRun).toHaveBeenCalledOnce()
  })

  it('calls extractText for each module', async () => {
    setupHappyPathMocks(7)

    await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 5 }),
    })

    expect(mockExtractText).toHaveBeenCalledTimes(2)
    expect(mockExtractText).toHaveBeenCalledWith(MODULE_A.file_path, MODULE_A.file_type)
    expect(mockExtractText).toHaveBeenCalledWith(MODULE_B.file_path, MODULE_B.file_type)
  })

  it('calls generateText once with outputType quiz', async () => {
    setupHappyPathMocks(7)

    await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module_ids: [1, 2], question_count: 5 }),
    })

    expect(mockGenerateText).toHaveBeenCalledOnce()
    const [params] = mockGenerateText.mock.calls[0]
    expect(params.outputType).toBe('quiz')
    expect(params.questionCount).toBe(5)
  })
})
