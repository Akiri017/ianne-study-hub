/**
 * Express route tests — weak-points router.
 *
 * Strategy: vi.mock('../db/index') replaces the DatabaseSync singleton with a
 * lightweight in-memory mock. Each test configures prepare() mock calls
 * independently via mockReturnValueOnce.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock — must be declared before importing routes ────────────────────────

vi.mock('../db/index', () => {
  return {
    default: {
      prepare: vi.fn(),
      exec: vi.fn(),
    },
  }
})

import db from '../db/index'
import weakPointsRouter, { subjectWeakPoints } from '../routes/weak-points'

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

    // Mount subject-scoped router — must have :subjectId param available
    app.use('/api/subjects/:subjectId/weak-points', subjectWeakPoints)

    // Mount standalone router
    app.use('/api/weak-points', weakPointsRouter)

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

// ── GET /api/subjects/:subjectId/weak-points ──────────────────────────────────

describe('GET /api/subjects/:subjectId/weak-points', () => {
  it('returns 200 with { weak_points: [] } on empty result', async () => {
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`)
    expect(res.status).toBe(200)

    const body = await res.json() as { weak_points: unknown[] }
    expect(body).toHaveProperty('weak_points')
    expect(Array.isArray(body.weak_points)).toBe(true)
    expect(body.weak_points).toHaveLength(0)
  })

  it('returns populated array when rows exist', async () => {
    const fakeWps = [
      {
        id: 1,
        subject_id: 1,
        topic: 'Scheduling',
        what_went_wrong: 'Mixed up FCFS and SJF',
        why_missed: "Didn't re-read notes",
        fix: 'Create a comparison table',
        status: 'Open',
        created_at: '2026-04-17T00:00:00Z',
        updated_at: '2026-04-17T00:00:00Z',
      },
    ]
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => fakeWps) })

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`)
    expect(res.status).toBe(200)

    const body = await res.json() as { weak_points: typeof fakeWps }
    expect(body.weak_points).toHaveLength(1)
    expect(body.weak_points[0].topic).toBe('Scheduling')
  })

  it('passes status query param through to the DB query', async () => {
    const mockAll = vi.fn(() => [])
    mockDb.prepare.mockReturnValueOnce({ all: mockAll })

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points?status=Open`)
    expect(res.status).toBe(200)

    // The mock was called — correct query branch was taken
    expect(mockAll).toHaveBeenCalled()
  })

  it('returns 400 for invalid status query param', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points?status=Invalid`)
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/status must be one of/)
  })
})

// ── POST /api/subjects/:subjectId/weak-points ─────────────────────────────────

describe('POST /api/subjects/:subjectId/weak-points', () => {
  const validBody = {
    topic: 'Paging',
    what_went_wrong: 'Confused page tables with segment tables',
    why_missed: 'Skipped that lecture',
    fix: 'Re-watch lecture recording and draw a diagram',
  }

  it('returns 201 with weak_point on valid body', async () => {
    const fakeWp = { id: 5, subject_id: 1, ...validBody, status: 'Open', created_at: '2026-04-17T00:00:00Z', updated_at: '2026-04-17T00:00:00Z' }

    mockDb.prepare
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 5 })) })
      .mockReturnValueOnce({ get: vi.fn(() => fakeWp) })

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(201)

    const body = await res.json() as { weak_point: typeof fakeWp }
    expect(body).toHaveProperty('weak_point')
    expect(body.weak_point.id).toBe(5)
    expect(body.weak_point.status).toBe('Open')
  })

  it('returns 201 when status is explicitly provided', async () => {
    const fakeWp = { id: 6, subject_id: 1, ...validBody, status: 'Patched', created_at: '2026-04-17T00:00:00Z', updated_at: '2026-04-17T00:00:00Z' }

    mockDb.prepare
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 6 })) })
      .mockReturnValueOnce({ get: vi.fn(() => fakeWp) })

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, status: 'Patched' }),
    })
    expect(res.status).toBe(201)

    const body = await res.json() as { weak_point: typeof fakeWp }
    expect(body.weak_point.status).toBe('Patched')
  })

  it('returns 400 when topic is missing', async () => {
    const { topic: _t, ...noTopic } = validBody

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noTopic),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/topic/)
  })

  it('returns 400 when what_went_wrong is missing', async () => {
    const { what_went_wrong: _w, ...noWww } = validBody

    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noWww),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/what_went_wrong/)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/1/weak-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, status: 'InvalidStatus' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/status must be one of/)
  })
})

// ── PATCH /api/weak-points/:id ────────────────────────────────────────────────

describe('PATCH /api/weak-points/:id', () => {
  it('returns 200 with { weak_point: { id, updated_at } } on valid update', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })  // existence check
      .mockReturnValueOnce({ run: vi.fn() })                     // UPDATE

    const res = await fetch(`${baseUrl}/api/weak-points/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Updated topic' }),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { weak_point: { id: number; updated_at: string } }
    expect(body).toHaveProperty('weak_point')
    expect(body.weak_point.id).toBe(1)
    expect(typeof body.weak_point.updated_at).toBe('string')
  })

  it('returns 404 when id does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/weak-points/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Something' }),
    })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 400 when no fields are provided', async () => {
    const res = await fetch(`${baseUrl}/api/weak-points/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/at least one field/)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await fetch(`${baseUrl}/api/weak-points/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Broken' }),
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/status must be one of/)
  })

  it('returns 404 for non-integer id', async () => {
    const res = await fetch(`${baseUrl}/api/weak-points/abc`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Something' }),
    })
    expect(res.status).toBe(404)
  })
})

// ── DELETE /api/weak-points/:id ───────────────────────────────────────────────

describe('DELETE /api/weak-points/:id', () => {
  it('returns 200 with { deleted: true } for a valid existing id', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })  // existence check
      .mockReturnValueOnce({ run: vi.fn() })                     // DELETE

    const res = await fetch(`${baseUrl}/api/weak-points/1`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })

  it('returns 404 for a non-existent id', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/weak-points/999`, { method: 'DELETE' })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for non-integer id', async () => {
    const res = await fetch(`${baseUrl}/api/weak-points/abc`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 404 for id 0 (boundary)', async () => {
    const res = await fetch(`${baseUrl}/api/weak-points/0`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
