import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock ──────────────────────────────────────────────────────────────────
vi.mock('../db/index', () => {
  return {
    default: {
      prepare: vi.fn(),
      exec: vi.fn(),
    },
  }
})

import db from '../db/index'
import annotationsRouter from '../routes/annotations'

let server: http.Server
let baseUrl: string

const mockDb = db as unknown as {
  prepare: ReturnType<typeof vi.fn>
  exec: ReturnType<typeof vi.fn>
}

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/modules/:moduleId/annotations', annotationsRouter)
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

describe('Annotations API', () => {
  describe('GET /api/modules/:moduleId/annotations', () => {
    it('returns 200 with annotations array', async () => {
      const fakeAnnotations = [{ id: 1, comment: 'test' }]
      mockDb.prepare.mockReturnValueOnce({ all: vi.fn(() => fakeAnnotations) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations`)
      expect(res.status).toBe(200)

      const body = await res.json() as { annotations: any[] }
      expect(body.annotations).toEqual(fakeAnnotations)
    })

    it('returns 404 for invalid module ID', async () => {
      const res = await fetch(`${baseUrl}/api/modules/abc/annotations`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/modules/:moduleId/annotations', () => {
    it('returns 201 with created annotation', async () => {
      const fakeAnnotation = { id: 1, selected_text: 'text', comment: 'comment', char_offset: 10 }
      mockDb.prepare
        .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // module exists
        .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 1 })) }) // INSERT
        .mockReturnValueOnce({ get: vi.fn(() => fakeAnnotation) }) // SELECT

      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: 'comment', char_offset: 10 }),
      })
      
      expect(res.status).toBe(201)
      const body = await res.json() as { annotation: any }
      expect(body.annotation).toEqual(fakeAnnotation)
    })

    it('returns 400 when missing fields', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'comment' }), // missing selected_text and char_offset
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 when module does not exist', async () => {
      mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

      const res = await fetch(`${baseUrl}/api/modules/999/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: 'comment', char_offset: 10 }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/modules/:moduleId/annotations/:annId', () => {
    it('returns 200 with updated annotation', async () => {
      const fakeAnnotation = { id: 1, comment: 'updated' }
      mockDb.prepare
        .mockReturnValueOnce({ run: vi.fn(() => ({ changes: 1 })) }) // UPDATE
        .mockReturnValueOnce({ get: vi.fn(() => fakeAnnotation) }) // SELECT

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'updated' }),
      })
      
      expect(res.status).toBe(200)
      const body = await res.json() as { annotation: any }
      expect(body.annotation).toEqual(fakeAnnotation)
    })

    it('returns 404 when annotation not found', async () => {
      mockDb.prepare.mockReturnValueOnce({ run: vi.fn(() => ({ changes: 0 })) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/999`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'updated' }),
      })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/modules/:moduleId/annotations/:annId', () => {
    it('returns 200 on success', async () => {
      mockDb.prepare.mockReturnValueOnce({ run: vi.fn(() => ({ changes: 1 })) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json() as { deleted: boolean }
      expect(body.deleted).toBe(true)
    })

    it('returns 404 when annotation not found', async () => {
      mockDb.prepare.mockReturnValueOnce({ run: vi.fn(() => ({ changes: 0 })) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/999`, { method: 'DELETE' })
      expect(res.status).toBe(404)
    })

    it('returns 404 for invalid annId', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations/abc`, { method: 'DELETE' })
      expect(res.status).toBe(404)
    })
  })

  // ── Additional QA tests ──────────────────────────────────────────────────

  describe('POST — edge cases', () => {
    it('returns 400 when comment is empty string', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: '', char_offset: 10 }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBeDefined()
    })

    it('accepts char_offset = 0 as a valid value', async () => {
      const fakeAnnotation = { id: 2, selected_text: 'text', comment: 'note', char_offset: 0 }
      mockDb.prepare
        .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // module exists
        .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 2 })) }) // INSERT
        .mockReturnValueOnce({ get: vi.fn(() => fakeAnnotation) }) // SELECT

      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: 'note', char_offset: 0 }),
      })

      expect(res.status).toBe(201)
      const body = await res.json() as { annotation: any }
      expect(body.annotation.char_offset).toBe(0)
    })

    it('returns 400 when selected_text is empty string', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: '', comment: 'comment', char_offset: 10 }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH — edge cases', () => {
    it('returns 400 when comment is empty string', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: '' }),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { error: string }
      expect(body.error).toBeDefined()
    })

    it('returns 404 for invalid annId', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations/abc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'updated' }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 when comment field is missing entirely', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })

  describe('Error response format — all errors return { error: string }', () => {
    it('GET 404 returns { error: string }', async () => {
      const res = await fetch(`${baseUrl}/api/modules/abc/annotations`)
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('POST 400 returns { error: string }', async () => {
      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('POST 404 returns { error: string }', async () => {
      mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

      const res = await fetch(`${baseUrl}/api/modules/999/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: 'comment', char_offset: 10 }),
      })
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('PATCH 404 returns { error: string }', async () => {
      mockDb.prepare.mockReturnValueOnce({ run: vi.fn(() => ({ changes: 0 })) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/999`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'updated' }),
      })
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('DELETE 404 returns { error: string }', async () => {
      mockDb.prepare.mockReturnValueOnce({ run: vi.fn(() => ({ changes: 0 })) })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/999`, { method: 'DELETE' })
      expect(res.status).toBe(404)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })
  })

  describe('Internal server error paths', () => {
    it('GET returns 500 with { error: string } on DB failure', async () => {
      mockDb.prepare.mockImplementationOnce(() => { throw new Error('DB crash') })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations`)
      expect(res.status).toBe(500)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('POST returns 500 with { error: string } on DB failure', async () => {
      mockDb.prepare
        .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // module exists
        .mockImplementationOnce(() => { throw new Error('insert failed') }) // INSERT throws

      const res = await fetch(`${baseUrl}/api/modules/1/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_text: 'text', comment: 'comment', char_offset: 10 }),
      })
      expect(res.status).toBe(500)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('PATCH returns 500 with { error: string } on DB failure', async () => {
      mockDb.prepare.mockImplementationOnce(() => { throw new Error('update crash') })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: 'new comment' }),
      })
      expect(res.status).toBe(500)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })

    it('DELETE returns 500 with { error: string } on DB failure', async () => {
      mockDb.prepare.mockImplementationOnce(() => { throw new Error('delete crash') })

      const res = await fetch(`${baseUrl}/api/modules/1/annotations/1`, { method: 'DELETE' })
      expect(res.status).toBe(500)
      const body = await res.json() as Record<string, unknown>
      expect(typeof body.error).toBe('string')
    })
  })
})
