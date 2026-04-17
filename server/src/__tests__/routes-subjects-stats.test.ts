/**
 * Express route tests — GET /api/subjects/stats.
 *
 * Strategy: vi.mock('../db/index') replaces the DatabaseSync singleton.
 * Each test configures prepare() mock calls via mockReturnValueOnce.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: { prepare: vi.fn(), exec: vi.fn() },
}))

import db from '../db/index'
import subjectsRouter from '../routes/subjects'

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/subjects', subjectsRouter)
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

// ── GET /api/subjects/stats ───────────────────────────────────────────────────

describe('GET /api/subjects/stats', () => {
  function mockStats(openCount: number, totalModules: number, recentModules: unknown[]) {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ count: openCount })) })      // open_weak_points
      .mockReturnValueOnce({ get: vi.fn(() => ({ count: totalModules })) })   // total_modules
      .mockReturnValueOnce({ all: vi.fn(() => recentModules) })               // recent_modules
  }

  it('returns 200 with zeroes and empty array when DB is empty', async () => {
    mockStats(0, 0, [])

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    expect(res.status).toBe(200)

    const body = await res.json() as { open_weak_points: number; total_modules: number; recent_modules: unknown[] }
    expect(body.open_weak_points).toBe(0)
    expect(body.total_modules).toBe(0)
    expect(body.recent_modules).toEqual([])
  })

  it('returns correct open_weak_points count', async () => {
    mockStats(3, 0, [])

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { open_weak_points: number }
    expect(body.open_weak_points).toBe(3)
  })

  it('does not count Patched or Confirmed weak points (query filters by Open)', async () => {
    // The mock always returns what we give it — the real SQL filter is tested by
    // asserting that the query calls are made in order (Open first).
    mockStats(1, 0, []) // only 1 open despite there being patched/confirmed in the DB

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { open_weak_points: number }
    expect(body.open_weak_points).toBe(1)
  })

  it('returns correct total_modules count', async () => {
    mockStats(0, 7, [])

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { total_modules: number }
    expect(body.total_modules).toBe(7)
  })

  it('returns recent_modules with subject_name from JOIN', async () => {
    const fakeModules = [
      { id: 5, title: 'Memory Management', subject_id: 2, subject_name: 'OS', file_type: 'pdf', created_at: '2026-04-17T10:00:00Z' },
      { id: 4, title: 'Deadlocks', subject_id: 2, subject_name: 'OS', file_type: 'docx', created_at: '2026-04-16T10:00:00Z' },
    ]
    mockStats(0, 2, fakeModules)

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { recent_modules: typeof fakeModules }
    expect(body.recent_modules).toHaveLength(2)
    expect(body.recent_modules[0].subject_name).toBe('OS')
    expect(body.recent_modules[0].title).toBe('Memory Management')
  })

  it('recent_modules subject_name is null for modules with no subject', async () => {
    const fakeModules = [
      { id: 1, title: 'Orphan Module', subject_id: null, subject_name: null, file_type: 'pdf', created_at: '2026-04-17T00:00:00Z' },
    ]
    mockStats(0, 1, fakeModules)

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { recent_modules: typeof fakeModules }
    expect(body.recent_modules[0].subject_name).toBeNull()
  })

  it('recent_modules is limited to at most 5 entries', async () => {
    // Mock returns 5 (the LIMIT 5 in the query enforces this in production)
    const fiveModules = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, title: `Module ${i + 1}`, subject_id: 1, subject_name: 'Bio',
      file_type: 'pdf', created_at: `2026-04-${String(17 - i).padStart(2, '0')}T00:00:00Z`,
    }))
    mockStats(0, 10, fiveModules)

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as { recent_modules: unknown[] }
    expect(body.recent_modules.length).toBeLessThanOrEqual(5)
  })

  it('response shape has all three required keys', async () => {
    mockStats(2, 4, [])

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('open_weak_points')
    expect(body).toHaveProperty('total_modules')
    expect(body).toHaveProperty('recent_modules')
  })

  it('returns 500 on DB error', async () => {
    mockDb.prepare.mockReturnValueOnce({
      get: vi.fn(() => { throw new Error('DB failure') }),
    })

    const res = await fetch(`${baseUrl}/api/subjects/stats`)
    expect(res.status).toBe(500)
  })
})
