/**
 * Unit tests — outputs routes.
 *
 * GET   /api/outputs/:id  — fetch a single ai_output record
 * PATCH /api/outputs/:id  — save inline edits to output content
 *
 * Strategy: vi.mock `../db/index` so we never touch a real database.
 * All routes return JSON — no SSE complexity here.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock ──────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import db from '../db/index'
import outputsRouter from '../routes/outputs'

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
      app.use('/api/outputs', outputsRouter)
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
})

// ── GET /api/outputs/:id ──────────────────────────────────────────────────────

describe('GET /api/outputs/:id', () => {
  it('returns 200 with the output record when found', async () => {
    const fakeOutput = {
      id: 1,
      module_id: 1,
      output_type: 'prescan',
      content: '# Heading\n- Term',
      instructions: null,
      created_at: '2026-04-16T00:00:00Z',
      updated_at: '2026-04-16T00:00:00Z',
    }
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => fakeOutput) })

    const res = await fetch(`${baseUrl}/api/outputs/1`)
    expect(res.status).toBe(200)

    const body = await res.json() as { output: typeof fakeOutput }
    expect(body).toHaveProperty('output')
    expect(body.output.id).toBe(1)
    expect(body.output.output_type).toBe('prescan')
    expect(body.output.content).toBe('# Heading\n- Term')
    expect(body.output.instructions).toBeNull()
  })

  it('returns 404 when output does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/outputs/999`)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for non-integer id', async () => {
    // Validation fires before DB — no mock needed
    const res = await fetch(`${baseUrl}/api/outputs/abc`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for id = 0 (not a positive integer)', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/0`)
    expect(res.status).toBe(404)
  })

  it('returns output with all expected fields', async () => {
    const fakeOutput = {
      id: 7,
      module_id: 3,
      output_type: 'notes',
      content: 'Structured notes here',
      instructions: 'Focus on chapter 2',
      created_at: '2026-04-17T10:00:00Z',
      updated_at: '2026-04-17T11:00:00Z',
    }
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => fakeOutput) })

    const res = await fetch(`${baseUrl}/api/outputs/7`)
    const body = await res.json() as { output: typeof fakeOutput }

    // Verify all fields are present and correct
    expect(body.output.module_id).toBe(3)
    expect(body.output.instructions).toBe('Focus on chapter 2')
    expect(body.output.created_at).toBe('2026-04-17T10:00:00Z')
    expect(body.output.updated_at).toBe('2026-04-17T11:00:00Z')
  })
})

// ── PATCH /api/outputs/:id ────────────────────────────────────────────────────

describe('PATCH /api/outputs/:id', () => {
  it('returns 200 with id and updated_at on success', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // existence check
      .mockReturnValueOnce({ run: vi.fn() })                   // UPDATE

    const res = await fetch(`${baseUrl}/api/outputs/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Updated content' }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { output: { id: number; updated_at: string } }
    expect(body).toHaveProperty('output')
    expect(body.output.id).toBe(1)
    expect(body.output.updated_at).toBeTruthy()
    // updated_at should be a valid ISO timestamp
    expect(new Date(body.output.updated_at).getTime()).not.toBeNaN()
  })

  it('returns 400 when content is missing from request body', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('content is required')
  })

  it('returns 400 when content is an empty string', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('content is required')
  })

  it('returns 400 when content is only whitespace', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '   ' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('content is required')
  })

  it('returns 400 when content is not a string (e.g. number)', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 42 }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when output does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) }) // existence check → not found

    const res = await fetch(`${baseUrl}/api/outputs/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Valid content' }),
    })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for non-integer id', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/xyz`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Valid content' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 for id = 0', async () => {
    const res = await fetch(`${baseUrl}/api/outputs/0`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Valid content' }),
    })
    expect(res.status).toBe(404)
  })

  it('calls db UPDATE with the new content', async () => {
    const mockRun = vi.fn()
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 2 })) })
      .mockReturnValueOnce({ run: mockRun })

    await fetch(`${baseUrl}/api/outputs/2`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'New inline edit' }),
    })

    expect(mockRun).toHaveBeenCalledOnce()
    // First arg to run() is the new content
    expect(mockRun.mock.calls[0][0]).toBe('New inline edit')
  })
})
