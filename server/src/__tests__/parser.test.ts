/**
 * Tests for server/src/services/parser.ts
 *
 * Strategy: the parser resolves files relative to UPLOADS_DIR (../../uploads
 * from the compiled output).  We cannot repoint that constant at test time
 * without mocking the module internals, so instead we:
 *
 *  1. Write real fixture files into the actual uploads directory before each
 *     test suite run and clean them up afterwards.
 *  2. For path-traversal and missing-file tests we rely only on the filenames
 *     — no real disk I/O needed because the guard throws before any read.
 *
 * The DOCX fixture is generated programmatically using the `docx` npm package
 * (already a project dependency) so we never commit binary blobs.
 *
 * The PDF fixture is a hand-crafted minimal valid PDF that contains the text
 * "Hello World" — small enough to keep in a hex literal.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Packer, Document, Paragraph, TextRun } from 'docx'
import PDFDocument from 'pdfkit'
import { extractText } from '../services/parser'

// ── Resolve uploads directory the same way parser.ts does ─────────────────────
// parser.ts resolves UPLOADS_DIR as: path.resolve(__dirname, '../../uploads')
// where __dirname = server/src/services → UPLOADS_DIR = server/uploads
// This test file lives at server/src/__tests__, so to reach server/uploads:
//   __dirname/../.. = server → server/uploads
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

const PDF_FIXTURE = 'test-fixture-hello.pdf'
const DOCX_FIXTURE = 'test-fixture-hello.docx'

// ── Minimal valid 1-page PDF containing "Hello World" ─────────────────────────
// Generated programmatically with PDFKit (already a project dependency) so the
// PDF structure is always spec-compliant and pdf-parse can extract text from it.
// Avoids the fragile hand-crafted hex literal that was failing due to bad XRef offsets.
function buildHelloWorldPdfBuffer(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(12).text('Hello World', 100, 700)
    doc.end()
  })
}

// ── Minimal DOCX generated with the `docx` package ───────────────────────────
async function buildHelloWorldDocxBuffer(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun('Hello World')],
          }),
        ],
      },
    ],
  })

  // Packer.toBuffer returns a Node Buffer
  return Packer.toBuffer(doc)
}

// ── Fixture lifecycle ──────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure uploads dir exists (it is gitignored and may not be present)
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })

  // Write PDF fixture — PDFKit generates spec-compliant PDF with extractable text
  const pdfBuffer = await buildHelloWorldPdfBuffer()
  fs.writeFileSync(path.join(UPLOADS_DIR, PDF_FIXTURE), pdfBuffer)

  // Write DOCX fixture
  const docxBuffer = await buildHelloWorldDocxBuffer()
  fs.writeFileSync(path.join(UPLOADS_DIR, DOCX_FIXTURE), docxBuffer)
})

afterAll(() => {
  // Clean up — remove only the test fixtures, not the whole uploads dir
  for (const fixture of [PDF_FIXTURE, DOCX_FIXTURE]) {
    const p = path.join(UPLOADS_DIR, fixture)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractText — PDF', () => {
  it('extracts non-empty text from a valid PDF fixture', async () => {
    const result = await extractText(PDF_FIXTURE, 'pdf')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // The hand-crafted PDF encodes "Hello World" as a PDF text string
    expect(result).toContain('Hello World')
  })

  it('returns a trimmed string with no leading/trailing whitespace', async () => {
    const result = await extractText(PDF_FIXTURE, 'pdf')
    expect(result).toBe(result.trim())
  })
})

describe('extractText — DOCX', () => {
  it('extracts non-empty text from a valid DOCX fixture', async () => {
    const result = await extractText(DOCX_FIXTURE, 'docx')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains the expected paragraph text', async () => {
    const result = await extractText(DOCX_FIXTURE, 'docx')
    expect(result).toContain('Hello World')
  })

  it('returns a trimmed string with no leading/trailing whitespace', async () => {
    const result = await extractText(DOCX_FIXTURE, 'docx')
    expect(result).toBe(result.trim())
  })
})

describe('extractText — error cases', () => {
  it('throws "unsupported file type" for an unrecognised fileType', async () => {
    // Cast to bypass TypeScript's type narrowing — tests the runtime guard
    await expect(
      extractText('some-file.txt', 'txt' as 'pdf')
    ).rejects.toThrow('unsupported file type: txt')
  })

  it('throws "file not found" for a non-existent filename', async () => {
    await expect(
      extractText('does-not-exist-xyz.pdf', 'pdf')
    ).rejects.toThrow('file not found: does-not-exist-xyz.pdf')
  })

  it('throws "invalid file path" for a path traversal attempt', async () => {
    await expect(
      extractText('../../../etc/passwd', 'pdf')
    ).rejects.toThrow('invalid file path')
  })

  it('throws "invalid file path" for a Windows-style traversal attempt', async () => {
    await expect(
      extractText('..\\..\\sensitive-file.pdf', 'pdf')
    ).rejects.toThrow('invalid file path')
  })
})
