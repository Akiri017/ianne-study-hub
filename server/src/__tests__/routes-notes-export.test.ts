/**
 * Unit tests — notes DOCX export route.
 *
 * GET /api/modules/:moduleId/notes/export
 *
 * Strategy:
 * - vi.mock `../db/index` so we never touch a real database.
 * - vi.mock `../services/exporter` to bypass actual DOCX generation.
 * - vi.hoisted for the exporter mock so the factory can reference it.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'http'
import express from 'express'
import { errorHandler } from '../middleware/error-handler'

// ── Hoist mock factories so they can be referenced in vi.mock() ───────────────

const { mockBuildDocx } = vi.hoisted(() => ({
  mockBuildDocx: vi.fn(),
}))

// ── DB mock ──────────────────────────────────────────────────────────────────

vi.mock('../db/index', () => ({
  default: {
    prepare: vi.fn(),
    exec: vi.fn(),
  },
}))

// ── Exporter service mock ─────────────────────────────────────────────────────

vi.mock('../services/exporter', () => ({
  buildReviewerDocx: mockBuildDocx,
  buildReviewerPdf: vi.fn(),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import db from '../db/index'
import { notesExportRouter } from '../routes/outputs'

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
      // Mirror the mount point from server/src/index.ts:
      //   api.use('/modules', notesExportRouter)
      app.use('/api/modules', notesExportRouter)
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

  // Default exporter mock — returns a minimal buffer
  mockBuildDocx.mockResolvedValue(Buffer.from('docx-bytes'))
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeModule = { id: 1, title: 'Operating Systems Chapter 3' }
const fakeNotesOutput = { id: 10, content: '## Key Concepts\n- Process scheduling\n- Thread management' }

async function getNotesExport(moduleId: number | string) {
  return fetch(`${baseUrl}/api/modules/${moduleId}/notes/export`)
}

// ── Case 1: Valid module ID + notes content exists ────────────────────────────

describe('GET /api/modules/:moduleId/notes/export — 200 DOCX download', () => {
  it('returns 200 with DOCX content-type and attachment header', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })       // module lookup
      .mockReturnValueOnce({ get: vi.fn(() => fakeNotesOutput) })  // ai_outputs query

    const res = await getNotesExport(1)
    expect(res.status).toBe(200)

    const contentType = res.headers.get('content-type') ?? ''
    expect(contentType).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('filename=')
  })

  it('includes a sanitised module title in the filename', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => fakeNotesOutput) })

    const res = await getNotesExport(1)
    const disposition = res.headers.get('content-disposition') ?? ''

    // Title "Operating Systems Chapter 3" → sanitised to lowercase with underscores
    expect(disposition).toContain('.docx')
    expect(disposition).toMatch(/filename=/)
  })

  it('calls buildReviewerDocx with the module title and notes content', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => fakeNotesOutput) })

    await getNotesExport(1)

    expect(mockBuildDocx).toHaveBeenCalledOnce()
    const [title, content] = mockBuildDocx.mock.calls[0] as [string, string]
    expect(title).toContain(fakeModule.title)
    expect(title).toContain('Notes')
    expect(content).toBe(fakeNotesOutput.content)
  })

  it('streams the DOCX buffer as the response body', async () => {
    const fakeBuffer = Buffer.from('fake-docx-binary-content')
    mockBuildDocx.mockResolvedValue(fakeBuffer)

    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => fakeNotesOutput) })

    const res = await getNotesExport(1)
    const body = Buffer.from(await res.arrayBuffer())

    expect(body.equals(fakeBuffer)).toBe(true)
  })
})

// ── Case 2: Valid module ID but no ai_outputs row for output_type = 'notes' ──

describe('GET /api/modules/:moduleId/notes/export — 404 no notes', () => {
  it('returns 404 when no ai_outputs row exists for notes', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })       // module found
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })        // no notes row

    const res = await getNotesExport(1)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No notes found for this module')
  })

  it('does not call buildReviewerDocx when no notes exist', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => undefined) })

    await getNotesExport(1)
    expect(mockBuildDocx).not.toHaveBeenCalled()
  })
})

// ── Case 3: Module ID does not exist in modules table ─────────────────────────

describe('GET /api/modules/:moduleId/notes/export — 404 module not found', () => {
  it('returns 404 when the module does not exist', async () => {
    mockDb.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) }) // no module

    const res = await getNotesExport(999)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('Module not found')
  })

  it('returns 404 for a non-integer moduleId', async () => {
    // Validation fires before DB — no mock needed
    const res = await getNotesExport('abc' as unknown as number)
    expect(res.status).toBe(404)
  })

  it('returns 404 for moduleId = 0 (not a positive integer)', async () => {
    const res = await getNotesExport(0)
    expect(res.status).toBe(404)
  })

  it('returns 404 for negative moduleId', async () => {
    const res = await getNotesExport(-5)
    expect(res.status).toBe(404)
  })
})

// ── Case 4: Notes row exists but content is empty string ──────────────────────

describe('GET /api/modules/:moduleId/notes/export — 404 empty content', () => {
  it('returns 404 when notes content is an empty string', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 10, content: '' })) })

    const res = await getNotesExport(1)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No notes found for this module')
  })

  it('returns 404 when notes content is only whitespace', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 10, content: '   ' })) })

    const res = await getNotesExport(1)
    expect(res.status).toBe(404)

    const body = await res.json() as { error: string }
    expect(body.error).toBe('No notes found for this module')
  })

  it('does not call buildReviewerDocx when content is empty', async () => {
    mockDb.prepare
      .mockReturnValueOnce({ get: vi.fn(() => fakeModule) })
      .mockReturnValueOnce({ get: vi.fn(() => ({ id: 10, content: '' })) })

    await getNotesExport(1)
    expect(mockBuildDocx).not.toHaveBeenCalled()
  })
})
