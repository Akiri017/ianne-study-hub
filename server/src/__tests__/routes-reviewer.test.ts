/**
 * Express route tests — reviewer export.
 *
 * POST /api/subjects/:subjectId/reviewer/export
 *
 * Strategy:
 * - vi.mock('../db/index') — prevents filesystem access, gives us full DB control.
 * - vi.mock('@google/genai') — prevents real API calls; returns a canned markdown string.
 * - vi.mock('../services/exporter') — bypasses actual docx/pdfkit builds so
 *   tests stay fast and don't depend on binary output correctness.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── Hoist mock factories so they can be referenced in vi.mock() ───────────────

const { mockGenerateContent, mockBuildDocx, mockBuildPdf } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockBuildDocx: vi.fn(),
  mockBuildPdf: vi.fn(),
}))

// ── DB mock ───────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

// ── Gemini SDK mock ───────────────────────────────────────────────────────────
// The route uses `new GoogleGenAI(...)` and calls `.models.generateContent(...)`.
// We replace the module with a factory function that returns a fake instance.

vi.mock('@google/genai', () => {
  function GoogleGenAI() {
    return {
      models: { generateContent: mockGenerateContent },
    }
  }
  return { GoogleGenAI }
})

// ── Exporter service mock ─────────────────────────────────────────────────────

vi.mock('../services/exporter', () => ({
  buildReviewerDocx: mockBuildDocx,
  buildReviewerPdf: mockBuildPdf,
}))

// ── Import route AFTER mocks are registered ───────────────────────────────────

import db from '../db/index'
import reviewerRouter from '../routes/reviewer'

const mockDb = db as unknown as { prepare: ReturnType<typeof vi.fn> }

// ── Test server ───────────────────────────────────────────────────────────────

let server: http.Server
let baseUrl: string

beforeAll(() =>
  new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    // Mirror the mount point from server/src/index.ts
    app.use('/api/subjects/:subjectId/reviewer', reviewerRouter)
    app.use(errorHandler)

    server = app.listen(0, () => {
      const addr = server.address() as { port: number }
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
)

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

beforeEach(() => {
  vi.resetAllMocks()

  // Default Gemini mock — returns a minimal markdown string
  mockGenerateContent.mockResolvedValue({ text: '## Topic\nSome reviewer content.' })

  // Default exporter mocks — return minimal buffers
  mockBuildDocx.mockResolvedValue(Buffer.from('docx-bytes'))
  mockBuildPdf.mockReturnValue(Buffer.from('pdf-bytes'))
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeSubject = { id: 1, name: 'Operating Systems' }

const fakeWeakPoints = [
  {
    id: 1,
    topic: 'Deadlock',
    what_went_wrong: 'confused deadlock with livelock',
    why_missed: 'did not review definitions',
    fix: 'memorise the four conditions',
    created_at: '2026-04-01T10:00:00Z',
  },
]

function setupHappyPathDb() {
  mockDb.prepare
    .mockReturnValueOnce({ get: vi.fn(() => fakeSubject) })         // subject lookup
    .mockReturnValueOnce({ all: vi.fn(() => fakeWeakPoints) })     // weak points query
}

async function postExport(subjectId: number | string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/subjects/${subjectId}/reviewer/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── POST /export — 200 DOCX download ─────────────────────────────────────────

describe('POST /api/subjects/:subjectId/reviewer/export — DOCX', () => {
  it('returns 200 with DOCX content-type and attachment header', async () => {
    setupHappyPathDb()

    const res = await postExport(1, { format: 'docx' })
    expect(res.status).toBe(200)

    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('.docx')
  })

  it('defaults to DOCX when format is omitted', async () => {
    setupHappyPathDb()

    const res = await postExport(1, {})
    expect(res.status).toBe(200)

    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  })

  it('calls buildReviewerDocx with the subject name and AI markdown', async () => {
    setupHappyPathDb()

    await postExport(1, { format: 'docx' })

    expect(mockBuildDocx).toHaveBeenCalledOnce()
    const [title, markdown] = mockBuildDocx.mock.calls[0] as [string, string]
    expect(title).toContain(fakeSubject.name)
    expect(typeof markdown).toBe('string')
    expect(markdown.length).toBeGreaterThan(0)
  })
})

// ── POST /export — 200 PDF download ──────────────────────────────────────────

describe('POST /api/subjects/:subjectId/reviewer/export — PDF', () => {
  it('returns 200 with PDF content-type and attachment header', async () => {
    setupHappyPathDb()

    const res = await postExport(1, { format: 'pdf' })
    expect(res.status).toBe(200)

    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('application/pdf')

    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('.pdf')
  })

  it('calls buildReviewerPdf with the subject name and AI markdown', async () => {
    setupHappyPathDb()

    await postExport(1, { format: 'pdf' })

    expect(mockBuildPdf).toHaveBeenCalledOnce()
    const [title, markdown] = mockBuildPdf.mock.calls[0] as [string, string]
    expect(title).toContain(fakeSubject.name)
    expect(typeof markdown).toBe('string')
  })
})

// ── POST /export — 400 no weak points ───────────────────────────────

describe('POST /api/subjects/:subjectId/reviewer/export — 400 no weak points', () => {
  it('returns 400 when the subject has no weak points', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeSubject) })   // subject found
      .mockReturnValueOnce({ all: vi.fn(() => []) })            // no WPs

    const res = await postExport(1, { format: 'docx' })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No weak points to export.')
  })

  it('does not call Gemini when there are no weak points', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeSubject) })
      .mockReturnValueOnce({ all: vi.fn(() => []) })

    await postExport(1, { format: 'docx' })
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })
})

// ── POST /export — 404 subject not found ─────────────────────────────────────

describe('POST /api/subjects/:subjectId/reviewer/export — 404 subject not found', () => {
  it('returns 404 when the subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) }) // no subject

    const res = await postExport(999, { format: 'docx' })
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Subject not found.')
  })

  it('returns 404 for a non-integer subjectId', async () => {
    // Validation fires before DB — no mock needed
    const res = await postExport('abc', { format: 'docx' })
    expect(res.status).toBe(404)
  })
})

// ── POST /export — 400 invalid format ────────────────────────────────────────

describe('POST /api/subjects/:subjectId/reviewer/export — validation', () => {
  it('returns 400 for an unrecognised format value', async () => {
    const res = await postExport(1, { format: 'txt' })
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toContain('format')
  })
})

// ── GET / — 200 JSON Response ────────────────────────────────────────────────

async function getReviewer(subjectId: number | string) {
  return fetch(`${baseUrl}/api/subjects/${subjectId}/reviewer`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/subjects/:subjectId/reviewer', () => {
  it('returns 200 with reviewer markdown content', async () => {
    setupHappyPathDb()

    const res = await getReviewer(1)
    expect(res.status).toBe(200)

    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain('application/json')

    const body = await res.json() as { content: string }
    expect(body.content).toBe('## Topic\nSome reviewer content.')
  })

  it('calls Gemini to generate content', async () => {
    setupHappyPathDb()

    await getReviewer(1)

    expect(mockGenerateContent).toHaveBeenCalledOnce()
    const callArgs = mockGenerateContent.mock.calls[0][0]
    expect(callArgs.model).toBeDefined()
    expect(callArgs.contents[0].parts[0].text).toContain(fakeSubject.name)
  })

  it('returns 400 when the subject has no weak points', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeSubject) })
      .mockReturnValueOnce({ all: vi.fn(() => []) })

    const res = await getReviewer(1)
    expect(res.status).toBe(400)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No weak points to review.')
  })

  it('returns 404 when the subject does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) })

    const res = await getReviewer(999)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Subject not found.')
  })

  it('returns 404 for a non-integer subjectId', async () => {
    const res = await getReviewer('abc')
    expect(res.status).toBe(404)
  })

  it('returns 500 when AI generation returns empty content', async () => {
    setupHappyPathDb()
    mockGenerateContent.mockResolvedValueOnce({ text: '' })

    const res = await getReviewer(1)
    expect(res.status).toBe(500)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('AI generation returned empty content.')
  })
})
