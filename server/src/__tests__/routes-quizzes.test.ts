/**
 * Express route tests — quizzes router.
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
import quizzesRouter, { subjectQuizzes } from '../routes/quizzes'

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/subjects/:subjectId/quizzes', subjectQuizzes)
    app.use('/api/quizzes', quizzesRouter)
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

// ── GET /api/quizzes/:id ──────────────────────────────────────────────────────

describe('GET /api/quizzes/:id', () => {
  it('returns 200 with parsed questions on valid quiz', async () => {
    const fakeRow = {
      id: 1,
      title: 'OS Midterm',
      question_count: 2,
      questions_json: JSON.stringify([
        { id: 'uuid-1', type: 'mcq', question: 'What is scheduling?', choices: ['a', 'b', 'c', 'd'], answer: 'a', topic: 'Scheduling' },
      ]),
      created_at: '2026-04-17T00:00:00Z',
    }
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => fakeRow) })

    const res = await fetch(`${baseUrl}/api/quizzes/1`)
    expect(res.status).toBe(200)

    const body = await res.json() as { quiz: { id: number; questions: unknown[] } }
    expect(body.quiz.id).toBe(1)
    expect(Array.isArray(body.quiz.questions)).toBe(true)
    expect(body.quiz.questions).toHaveLength(1)
  })

  it('returns 404 when quiz not found', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/quizzes/999`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-numeric id', async () => {
    const res = await fetch(`${baseUrl}/api/quizzes/abc`)
    expect(res.status).toBe(404)
  })
})

// ── POST /api/quizzes/:id/sessions ───────────────────────────────────────────

describe('POST /api/quizzes/:id/sessions', () => {
  it('returns 201 with new session on valid quiz', async () => {
    const fakeSession = {
      id: 10, quiz_id: 1, score: 0, total: 5, answers_json: '[]', completed_at: null,
    }
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1, question_count: 5 })) }) // quiz exists
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 10 })) })        // INSERT
      .mockReturnValueOnce({ get: vi.fn(() => fakeSession) })                       // SELECT new row

    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions`, { method: 'POST' })
    expect(res.status).toBe(201)

    const body = await res.json() as { session: typeof fakeSession }
    expect(body.session.id).toBe(10)
    expect(body.session.score).toBe(0)
    expect(body.session.completed_at).toBeNull()
  })

  it('returns 404 when quiz does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/quizzes/999/sessions`, { method: 'POST' })
    expect(res.status).toBe(404)
  })
})

// ── GET /api/quizzes/:id/sessions/:sessionId ─────────────────────────────────

describe('GET /api/quizzes/:id/sessions/:sessionId', () => {
  it('returns 200 with session when found', async () => {
    const fakeSession = {
      id: 5, quiz_id: 1, score: 3, total: 5, answers_json: '[]', completed_at: '2026-04-17T10:00:00Z',
    }
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => fakeSession) })

    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/5`)
    expect(res.status).toBe(200)

    const body = await res.json() as { session: typeof fakeSession }
    expect(body.session.id).toBe(5)
    expect(body.session.score).toBe(3)
  })

  it('returns 404 when session not found', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/999`)
    expect(res.status).toBe(404)
  })
})

// ── PATCH /api/quizzes/:id/sessions/:sessionId ───────────────────────────────

describe('PATCH /api/quizzes/:id/sessions/:sessionId', () => {
  const validBody = {
    score: 4,
    answers: [
      { question_id: 'q1', user_answer: 'a', correct: true },
      { question_id: 'q2', user_answer: 'b', correct: false },
    ],
  }

  it('returns 200 with updated session on valid body', async () => {
    const updatedSession = { id: 5, quiz_id: 1, score: 4, total: 5, answers_json: '[]', completed_at: '2026-04-17T10:00:00Z' }
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 5 })) })     // session exists
      .mockReturnValueOnce({ run: vi.fn() })                        // UPDATE
      .mockReturnValueOnce({ get: vi.fn(() => updatedSession) })   // SELECT updated

    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(200)

    const body = await res.json() as { session: typeof updatedSession }
    expect(body.session.score).toBe(4)
    expect(body.session.completed_at).toBeTruthy()
  })

  it('returns 400 when score is missing', async () => {
    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: [] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('score')
  })

  it('returns 400 when answers is not an array', async () => {
    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 3, answers: 'not-array' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('answers')
  })

  it('returns 404 when session not found', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/quizzes/1/sessions/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(404)
  })
})

// ── GET /api/subjects/:subjectId/quizzes ─────────────────────────────────────

describe('GET /api/subjects/:subjectId/quizzes', () => {
  it('returns 200 with empty quizzes array when none exist', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // subject exists
      .mockReturnValueOnce({ all: vi.fn(() => []) })           // quizzes query

    const res = await fetch(`${baseUrl}/api/subjects/1/quizzes`)
    expect(res.status).toBe(200)

    const body = await res.json() as { quizzes: unknown[] }
    expect(Array.isArray(body.quizzes)).toBe(true)
    expect(body.quizzes).toHaveLength(0)
  })

  it('returns quizzes that include modules from this subject', async () => {
    const fakeQuizzes = [
      { id: 3, title: 'OS Finals', question_count: 10, created_at: '2026-04-17T00:00:00Z' },
    ]
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })
      .mockReturnValueOnce({ all: vi.fn(() => fakeQuizzes) })

    const res = await fetch(`${baseUrl}/api/subjects/1/quizzes`)
    const body = await res.json() as { quizzes: typeof fakeQuizzes }
    expect(body.quizzes).toHaveLength(1)
    expect(body.quizzes[0].title).toBe('OS Finals')
  })

  it('returns 404 when subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/subjects/999/quizzes`)
    expect(res.status).toBe(404)
  })
})
