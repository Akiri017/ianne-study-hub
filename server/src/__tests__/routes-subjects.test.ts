/**
 * Express route tests — subjects router.
 *
 * Strategy: vi.mock('../db/index') replaces the DatabaseSync singleton with a
 * lightweight in-memory mock so routes are tested against real handler logic
 * without touching the filesystem or a real SQLite database.
 *
 * Each test configures the relevant db.prepare() mock calls before making
 * requests, giving us full control over DB return values.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock — must be declared before importing routes ────────────────────────
// We need to return different results per test, so we track the mock object and
// use mockReturnValueOnce in each test to set up the sequence of prepare() calls.

vi.mock('../db/index', () => {
  return {
    default: {
      prepare: vi.fn(),
      exec: vi.fn(),
    },
  }
})

// Import route AFTER mock is registered so Vitest's hoisting takes effect
import db from '../db/index'
import subjectsRouter from '../routes/subjects'

// Typed shorthand for the mocked db
const mockDb = db as unknown as {
  prepare: ReturnType<typeof vi.fn>
}

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/subjects', subjectsRouter)
    app.use(errorHandler)

    // Ephemeral port — avoids conflicts with a running dev server
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

// Reset mock state between tests so mockReturnValueOnce queues don't bleed
beforeEach(() => {
  vi.resetAllMocks()
})

// ── GET /api/subjects ─────────────────────────────────────────────────────────

describe('GET /api/subjects', () => {
  it('returns 200 with { subjects: [] } on empty DB', async () => {
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await fetch(`${baseUrl}/api/subjects`)
    expect(res.status).toBe(200)

    const body = await res.json() as { subjects: unknown[] }
    expect(body).toHaveProperty('subjects')
    expect(Array.isArray(body.subjects)).toBe(true)
    expect(body.subjects).toHaveLength(0)
  })

  it('returns populated subjects array after rows exist', async () => {
    const fakeSubjects = [
      { id: 1, name: 'Operating Systems', created_at: '2026-04-16T00:00:00Z' },
      { id: 2, name: 'Data Structures', created_at: '2026-04-16T01:00:00Z' },
    ]
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => fakeSubjects) })

    const res = await fetch(`${baseUrl}/api/subjects`)
    expect(res.status).toBe(200)

    const body = await res.json() as { subjects: typeof fakeSubjects }
    expect(body.subjects).toHaveLength(2)
    expect(body.subjects[0].name).toBe('Operating Systems')
  })

  it('responds with Content-Type: application/json', async () => {
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await fetch(`${baseUrl}/api/subjects`)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })
})

// ── POST /api/subjects ────────────────────────────────────────────────────────

describe('POST /api/subjects', () => {
  it('returns 201 with subject on valid name', async () => {
    const fakeSubject = { id: 1, name: 'Operating Systems', created_at: '2026-04-16T00:00:00Z' }

    mockDb.prepare
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 1 })) }) // INSERT
      .mockReturnValueOnce({ get: vi.fn(() => fakeSubject) })               // SELECT after INSERT

    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Operating Systems' }),
    })
    expect(res.status).toBe(201)

    const body = await res.json() as { subject: typeof fakeSubject }
    expect(body).toHaveProperty('subject')
    expect(body.subject.name).toBe('Operating Systems')
    expect(body.subject.id).toBe(1)
  })

  it('returns 400 with { error: "name is required" } on empty name', async () => {
    // No db calls expected — validation fires before any DB interaction
    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('name is required')
  })

  it('returns 400 with { error: "name is required" } on whitespace-only name', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('name is required')
  })

  it('returns 400 with { error: "name is required" } when name is missing', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('name is required')
  })

  it('returns 400 with { error: "subject already exists" } on duplicate name', async () => {
    // Simulate UNIQUE constraint violation
    const uniqueError = new Error('UNIQUE constraint failed: subjects.name')
    mockDb.prepare.mockReturnValueOnce({
      run: vi.fn(() => { throw uniqueError }),
    })

    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Operating Systems' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('subject already exists')
  })
})

// ── DELETE /api/subjects/:id ──────────────────────────────────────────────────

describe('DELETE /api/subjects/:id', () => {
  it('returns 200 with { deleted: true } for a valid existing id', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // SELECT — exists
      .mockReturnValueOnce({ run: vi.fn() })                    // DELETE

    const res = await fetch(`${baseUrl}/api/subjects/1`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })

  it('returns 404 with { error: "not found" } for a non-existent id', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) }) // not found

    const res = await fetch(`${baseUrl}/api/subjects/999`, { method: 'DELETE' })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for a non-integer id', async () => {
    // Validation fires before any DB call — no mock needed
    const res = await fetch(`${baseUrl}/api/subjects/abc`, { method: 'DELETE' })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for id 0 (boundary)', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/0`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

// ── Unknown routes ────────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('unregistered route returns 404, not an unhandled crash', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`)
    expect(res.status).toBe(404)
  })
})
