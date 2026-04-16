/**
 * Unit tests — modules router.
 *
 * Strategy: vi.mock both `../db/index` and `fs` so we never touch a real
 * database or filesystem. We test only our route logic — validation,
 * response shaping, and error handling.
 *
 * The upload route uses multer middleware which writes to disk. We mock multer
 * itself to inject a fake `req.file` and `req.body` and skip the actual file
 * write, letting us focus on the business logic that runs after multer finishes.
 *
 * Important: use vi.resetAllMocks() in beforeEach so each test starts with a
 * clean mock state (no leftover mockReturnValueOnce queues from prior tests).
 */

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
import express, { Request, Response, NextFunction } from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── DB mock ──────────────────────────────────────────────────────────────────

// Must be declared before any import that pulls in db so vi.mock hoists correctly.
vi.mock('../db/index', () => {
  return {
    default: {
      prepare: vi.fn(),
      exec: vi.fn(),
    },
  }
})

// ── fs mock ──────────────────────────────────────────────────────────────────

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true), // pretend uploads dir exists
    mkdirSync: vi.fn(),
    unlink: vi.fn((_p: string, cb: (err: null) => void) => cb(null)),
    unlinkSync: vi.fn(),
  }
})

// ── Multer mock ───────────────────────────────────────────────────────────────
// Replace the upload middleware module entirely. The mock injects req.file and
// req.body so downstream route logic sees what multer would have populated after
// parsing a multipart/form-data request.
//
// Individual tests can customise req.body (e.g. omit title) by setting
// req._mockBody before the request reaches the middleware.

vi.mock('../middleware/upload', () => {
  const fakeUpload = {
    single: (_fieldName: string) =>
      (req: Request, _res: Response, next: NextFunction) => {
        // Inject a valid PDF file stub by default
        if (!('_multerError' in req)) {
          ;(req as Request & { file?: Express.Multer.File }).file = {
            fieldname: 'file',
            originalname: 'lecture.pdf',
            encoding: '7bit',
            mimetype: 'application/pdf',
            destination: '/fake/uploads',
            filename: 'abc123def456.pdf',
            path: '/fake/uploads/abc123def456.pdf',
            size: 1024,
            buffer: Buffer.alloc(0),
            stream: null as unknown as NodeJS.ReadableStream,
          }
        }

        // Simulate multer populating req.body from multipart form fields.
        // Real multer does this automatically; we inject via a sentinel request
        // header so tests can control the title value without actual multipart parsing.
        if (!req.body) req.body = {}
        const mockTitle = req.headers['x-mock-title']
        if (typeof mockTitle === 'string') {
          req.body.title = mockTitle
        }

        next()
      },
  }

  return {
    upload: fakeUpload,
    UPLOADS_DIR: '/fake/uploads',
  }
})

// ── Import after mocks ────────────────────────────────────────────────────────

import db from '../db/index'
import modulesRouter, { deleteModule } from '../routes/modules'

// ── Test app setup ────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

// Typed shorthand for the mocked db
const mockDb = db as unknown as {
  prepare: ReturnType<typeof vi.fn>
}

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())

    // Mount subject-scoped modules router
    app.use('/api/subjects/:subjectId/modules', modulesRouter)
    // Mount standalone delete router
    app.use('/api/modules', deleteModule)
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

// Reset ALL mock state between tests — clears mockReturnValueOnce queues,
// call history, and implementations so tests are fully isolated.
beforeEach(() => {
  vi.resetAllMocks()
})

// ── GET /api/subjects/:subjectId/modules ──────────────────────────────────────

describe('GET /api/subjects/:subjectId/modules', () => {
  it('returns 200 with modules + outputs when subject exists', async () => {
    const fakeModules = [
      { id: 1, title: 'Lecture 1', file_type: 'pdf', created_at: '2026-04-16T00:00:00Z' },
    ]

    // prepare() call 1: subject existence check → get() returns a subject
    // prepare() call 2: modules list → all() returns fakeModules
    // prepare() call 3: outputs for module 1 → all() returns []
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })
      .mockReturnValueOnce({ all: vi.fn(() => fakeModules) })
      .mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await fetch(`${baseUrl}/api/subjects/1/modules`)
    expect(res.status).toBe(200)

    const body = await res.json() as { modules: unknown[] }
    expect(body).toHaveProperty('modules')
    expect(Array.isArray(body.modules)).toBe(true)
    expect(body.modules).toHaveLength(1)
  })

  it('returns 404 when subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/subjects/999/modules`)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for non-integer subjectId', async () => {
    // Validation fires before DB — no mock needed
    const res = await fetch(`${baseUrl}/api/subjects/abc/modules`)
    expect(res.status).toBe(404)
  })

  it('returns modules with outputs: [] for modules that have no ai_outputs', async () => {
    const fakeModules = [
      { id: 5, title: 'Lecture 5', file_type: 'docx', created_at: '2026-04-16T02:00:00Z' },
    ]
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })
      .mockReturnValueOnce({ all: vi.fn(() => fakeModules) })
      .mockReturnValueOnce({ all: vi.fn(() => []) }) // no outputs

    const res = await fetch(`${baseUrl}/api/subjects/1/modules`)
    expect(res.status).toBe(200)

    const body = await res.json() as { modules: Array<{ outputs: unknown[] }> }
    expect(body.modules[0].outputs).toEqual([])
  })
})

// ── POST /api/subjects/:subjectId/modules/upload ─────────────────────────────

describe('POST /api/subjects/:subjectId/modules/upload', () => {
  it('returns 201 with module on valid upload', async () => {
    const fakeModule = {
      id: 1,
      subject_id: 1,
      title: 'Lecture 1',
      file_type: 'pdf',
      created_at: '2026-04-16T00:00:00Z',
    }

    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) })              // subject exists
      .mockReturnValueOnce({ run: vi.fn(() => ({ lastInsertRowid: 1 })) }) // INSERT
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })               // SELECT after INSERT

    // Use a custom header to signal the mock multer what title to inject
    const res = await fetch(`${baseUrl}/api/subjects/1/modules/upload`, {
      method: 'POST',
      headers: {
        // Signal the mock multer to set req.body.title = 'Lecture 1'
        'x-mock-title': 'Lecture 1',
      },
    })
    expect(res.status).toBe(201)

    const body = await res.json() as { module: { id: number; file_type: string } }
    expect(body).toHaveProperty('module')
    expect(body.module.id).toBe(1)
    expect(body.module.file_type).toBe('pdf')
  })

  it('returns 400 when title is missing', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => ({ id: 1 })) }) // subject exists

    // No x-mock-title header → mock multer won't set req.body.title → title is empty
    const res = await fetch(`${baseUrl}/api/subjects/1/modules/upload`, {
      method: 'POST',
    })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('title is required')
  })

  it('returns 404 when subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) }) // subject missing

    const res = await fetch(`${baseUrl}/api/subjects/999/modules/upload`, {
      method: 'POST',
      headers: { 'x-mock-title': 'Orphan Module' },
    })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })
})

// ── DELETE /api/modules/:id ───────────────────────────────────────────────────

describe('DELETE /api/modules/:id', () => {
  it('returns 200 { deleted: true } when module exists', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 1, file_path: 'abc123.pdf' })) })
      .mockReturnValueOnce({ run: vi.fn() })

    const res = await fetch(`${baseUrl}/api/modules/1`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })

  it('returns 404 when module does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await fetch(`${baseUrl}/api/modules/999`, { method: 'DELETE' })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('not found')
  })

  it('returns 404 for non-integer id', async () => {
    const res = await fetch(`${baseUrl}/api/modules/xyz`, { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('still deletes DB row if file is missing from disk (ENOENT)', async () => {
    const fs = await import('fs')
    // Simulate ENOENT from unlinkSync — module still deletes DB row and returns 200
    vi.mocked(fs.unlinkSync).mockImplementationOnce(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })

    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 2, file_path: 'missing.pdf' })) })
      .mockReturnValueOnce({ run: vi.fn() })

    const res = await fetch(`${baseUrl}/api/modules/2`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })
})
