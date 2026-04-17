/**
 * Unit tests — generate routes.
 *
 * POST /api/modules/:moduleId/generate  — single-module generation (SSE)
 * POST /api/generate/multi-module-quiz  — 501 stub
 * POST /api/outputs/:outputId/regenerate — regenerate with instructions
 *
 * Strategy: vi.mock both `../db/index` and `../services/claude` so we
 * never touch a real database or call the Anthropic API. streamGeneration
 * is mocked to write a minimal valid SSE response so route logic around it
 * (validation, DB upsert, error paths) can be tested in isolation.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── Hoist mock references ────────────────────────────────────────────────────

const { mockStreamGeneration, mockExtractText } = vi.hoisted(() => ({
  mockStreamGeneration: vi.fn(),
  mockExtractText: vi.fn(),
}))

// ── DB mock ──────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

// ── Claude service mock ───────────────────────────────────────────────────────
// streamGeneration writes a minimal valid SSE body by default.
// Individual tests override this with mockResolvedValueOnce / mockRejectedValueOnce.

vi.mock('../services/claude', () => ({
  streamGeneration: mockStreamGeneration,
  extractText: mockExtractText,
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import db from '../db/index'
import generateRouter, { multiModuleQuiz, regenerate } from '../routes/generate'

// ── Typed mock shorthand ──────────────────────────────────────────────────────

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      const app = express()
      app.use(express.json())

      // Mirror the same mount points as server/src/index.ts
      app.use('/api/modules/:moduleId/generate', generateRouter)
      app.use('/api/generate', multiModuleQuiz)
      app.use('/api/outputs/:outputId/regenerate', regenerate)

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

  // Default streamGeneration: writes a minimal SSE body and returns content.
  mockStreamGeneration.mockImplementation(async (res: express.Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify('chunk')}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return 'chunk'
  })

  // Default extractText: returns a simple string.
  mockExtractText.mockResolvedValue('extracted module text')
})

// ── POST /api/modules/:moduleId/generate — validation ────────────────────────

describe('POST /api/modules/:moduleId/generate — validation', () => {
  it('returns 404 for non-integer moduleId', async () => {
    const res = await fetch(`${baseUrl}/api/modules/abc/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 for missing output_type', async () => {
    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('invalid output_type')
  })

  it('returns 400 for unrecognised output_type', async () => {
    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'summary' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('invalid output_type')
  })

  it('returns 400 for quiz without question_count', async () => {
    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'quiz' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('question_count required for quiz')
  })

  it('returns 400 for quiz with non-integer question_count', async () => {
    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'quiz', question_count: 'ten' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when module does not exist in DB', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/modules/999/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 422 when extractText throws', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockExtractText.mockRejectedValueOnce(new Error('corrupt PDF'))

    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('could not extract file content')
  })
})

// ── POST /api/modules/:moduleId/generate — happy path ────────────────────────

describe('POST /api/modules/:moduleId/generate — happy path', () => {
  it('returns SSE response with correct Content-Type', async () => {
    // Module row
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    // upsertOutput: no existing row → INSERT
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })
      .mockReturnValueOnce({ run: vi.fn() })

    const res = await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('[DONE]')
  })

  it('upserts output to DB after stream completes (INSERT when no existing row)', async () => {
    const mockInsertRun = vi.fn()

    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    // SELECT for existing row → none
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })
    // INSERT
    mockDb.prepare.mockReturnValueOnce({ run: mockInsertRun })

    await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'notes' }),
    })

    expect(mockInsertRun).toHaveBeenCalled()
  })

  it('upserts output to DB after stream completes (UPDATE when row exists)', async () => {
    const mockUpdateRun = vi.fn()

    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    // SELECT → existing row with id=5
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => ({ id: 5 })) })
    // UPDATE
    mockDb.prepare.mockReturnValueOnce({ run: mockUpdateRun })

    await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })

    expect(mockUpdateRun).toHaveBeenCalled()
  })

  it('calls streamGeneration with correct params for prescan', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })
      .mockReturnValueOnce({ run: vi.fn() })

    await fetch(`${baseUrl}/api/modules/1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'prescan' }),
    })

    expect(mockStreamGeneration).toHaveBeenCalledOnce()
    const [, params] = mockStreamGeneration.mock.calls[0]
    expect(params.outputType).toBe('prescan')
    expect(params.text).toBe('extracted module text')
  })

  it('calls streamGeneration with questionCount for quiz', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 2, subject_id: 1, title: 'Lec 2', file_path: 'xyz.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })
      .mockReturnValueOnce({ run: vi.fn() })

    await fetch(`${baseUrl}/api/modules/2/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output_type: 'quiz', question_count: 7 }),
    })

    const [, params] = mockStreamGeneration.mock.calls[0]
    expect(params.outputType).toBe('quiz')
    expect(params.questionCount).toBe(7)
  })
})

// ── POST /api/generate/multi-module-quiz — stub ───────────────────────────────

describe('POST /api/generate/multi-module-quiz', () => {
  it('returns 501 not implemented', async () => {
    const res = await fetch(`${baseUrl}/api/generate/multi-module-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(501)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('not implemented')
  })
})

// ── POST /api/outputs/:outputId/regenerate ────────────────────────────────────

describe('POST /api/outputs/:outputId/regenerate — validation', () => {
  it('returns 404 for non-integer outputId', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/bad/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'redo' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when output row does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/outputs/99/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'redo' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 when parent module is missing', async () => {
    // Output row found
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, module_id: 42, output_type: 'prescan', content: 'old', instructions: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      })),
    })
    // Module lookup returns nothing
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/outputs/1/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'redo' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('module not found')
  })

  it('returns 422 when extractText throws during regeneration', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, module_id: 1, output_type: 'notes', content: 'old', instructions: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      })),
    })
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockExtractText.mockRejectedValueOnce(new Error('parse error'))

    const res = await fetch(`${baseUrl}/api/outputs/1/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'try again' }),
    })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/outputs/:outputId/regenerate — happy path', () => {
  it('returns SSE stream and updates existing output row', async () => {
    const mockUpdateRun = vi.fn()

    // Output row
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 3, module_id: 1, output_type: 'prescan', content: 'old prescan', instructions: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      })),
    })
    // Module row
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    // UPDATE output row
    mockDb.prepare.mockReturnValueOnce({ run: mockUpdateRun })

    const res = await fetch(`${baseUrl}/api/outputs/3/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'be more concise' }),
    })

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const text = await res.text()
    expect(text).toContain('[DONE]')
    expect(mockUpdateRun).toHaveBeenCalled()
  })

  it('passes instructions to streamGeneration', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 4, module_id: 1, output_type: 'notes', content: 'old', instructions: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      })),
    })
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockDb.prepare.mockReturnValueOnce({ run: vi.fn() })

    await fetch(`${baseUrl}/api/outputs/4/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'add more examples' }),
    })

    const [, params] = mockStreamGeneration.mock.calls[0]
    expect(params.instructions).toBe('add more examples')
    expect(params.outputType).toBe('notes')
  })

  it('infers quiz question count from the existing content array length', async () => {
    // Existing quiz output with 3 questions
    const existingContent = JSON.stringify([
      { id: 'q1', type: 'mcq' },
      { id: 'q2', type: 'mcq' },
      { id: 'q3', type: 'short_answer' },
    ])

    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 5, module_id: 1, output_type: 'quiz', content: existingContent, instructions: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      })),
    })
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => ({
        id: 1, subject_id: 1, title: 'Lec 1', file_path: 'abc.pdf', file_type: 'pdf', created_at: '2026-01-01',
      })),
    })
    mockDb.prepare.mockReturnValueOnce({ run: vi.fn() })

    await fetch(`${baseUrl}/api/outputs/5/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const [, params] = mockStreamGeneration.mock.calls[0]
    expect(params.questionCount).toBe(3)
  })
})
