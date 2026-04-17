/**
 * Express route tests — tasks router.
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
import tasksRouter, { subjectTasks } from '../routes/tasks'

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/subjects/:subjectId/tasks', subjectTasks)
    app.use('/api/tasks', tasksRouter)
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

// ── GET /api/tasks ────────────────────────────────────────────────────────────

describe('GET /api/tasks', () => {
  it('returns 200 with empty tasks array', async () => {
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await fetch(`${baseUrl}/api/tasks`)
    expect(res.status).toBe(200)

    const body = await res.json() as { tasks: unknown[] }
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.tasks).toHaveLength(0)
  })

  it('returns tasks with subject_name when rows exist', async () => {
    const fakeTasks = [{
      id: 1, subject_id: 2, title: 'Read chapter 3', due_date: '2026-05-01',
      completed: 0, subject_name: 'OS',
    }]
    mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => fakeTasks) })

    const res = await fetch(`${baseUrl}/api/tasks`)
    const body = await res.json() as { tasks: typeof fakeTasks }
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].subject_name).toBe('OS')
  })
})

// ── GET /api/subjects/:subjectId/tasks ────────────────────────────────────────

describe('GET /api/subjects/:subjectId/tasks', () => {
  it('returns 200 with tasks for the subject', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // subject exists
      .mockReturnValueOnce({ all: vi.fn(() => []) })           // tasks query

    const res = await fetch(`${baseUrl}/api/subjects/1/tasks`)
    expect(res.status).toBe(200)
    const body = await res.json() as { tasks: unknown[] }
    expect(Array.isArray(body.tasks)).toBe(true)
  })

  it('returns 404 when subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/subjects/999/tasks`)
    expect(res.status).toBe(404)
  })
})

// ── POST /api/subjects/:subjectId/tasks ───────────────────────────────────────

describe('POST /api/subjects/:subjectId/tasks', () => {
  const validBody = { title: 'Review notes', due_date: '2026-05-10' }

  it('returns 201 with task on valid body', async () => {
    const fakeTask = { id: 3, subject_id: 1, title: 'Review notes', due_date: '2026-05-10', completed: 0 }
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })           // subject exists
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 3 })) }) // INSERT
      .mockReturnValueOnce({ get: vi.fn(() => fakeTask) })                // SELECT new row

    const res = await fetch(`${baseUrl}/api/subjects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { task: typeof fakeTask }
    expect(body.task.title).toBe('Review notes')
  })

  it('returns 400 when title is missing', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: '2026-05-01' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('title')
  })

  it('returns 400 when due_date is invalid format', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/1/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Study', due_date: 'not-a-date' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('due_date')
  })

  it('returns 404 when subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/subjects/999/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(404)
  })
})

// ── PATCH /api/tasks/:id ──────────────────────────────────────────────────────

describe('PATCH /api/tasks/:id', () => {
  it('returns 200 with task id on successful update', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // exists check
      .mockReturnValueOnce({ run: vi.fn() })                   // UPDATE

    const res = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { task: { id: number } }
    expect(body.task.id).toBe(1)
  })

  it('returns 404 when task does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/tasks/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: false }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no fields provided', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('at least one field')
  })

  it('returns 400 when due_date format is invalid', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: 'bad' }),
    })
    expect(res.status).toBe(400)
  })
})

// ── DELETE /api/tasks/:id ─────────────────────────────────────────────────────

describe('DELETE /api/tasks/:id', () => {
  it('returns 200 with { deleted: true } on success', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 2 })) }) // exists
      .mockReturnValueOnce({ run: vi.fn() })                   // DELETE

    const res = await fetch(`${baseUrl}/api/tasks/2`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })

  it('returns 404 when task does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/tasks/999`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
