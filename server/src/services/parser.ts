/**
 * File parsing service — extracts plain text from uploaded PDF and DOCX files.
 *
 * This module is intentionally free of Claude API calls. It is a pure
 * extraction layer that AI generation routes call before building prompts.
 */

import fs from 'fs'
import path from 'path'

// pdf-parse ships no .d.ts and @types/pdf-parse is not installed.
// skipLibCheck is enabled in tsconfig, so this import works at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number; info: unknown }>

import mammoth from 'mammoth'

// Resolve once at module load — all file operations are relative to this dir.
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Collapses platform line endings and excessive blank lines, then trims.
 * Applied to all extractor outputs so callers get consistent whitespace.
 */
function normalise(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n') // Windows line endings → Unix
    .replace(/\n{3,}/g, '\n\n') // 3+ consecutive blank lines → 2
    .trim()
}

/**
 * Resolves `filename` inside UPLOADS_DIR and validates the result.
 * Throws before any disk read if the path escapes the uploads directory
 * or if the file does not exist.
 */
function resolveAndValidate(filename: string): string {
  const fullPath = path.resolve(UPLOADS_DIR, filename)

  // Path traversal guard — resolved path must stay inside uploads dir.
  // Use path.sep-normalised comparison to handle OS differences.
  if (!fullPath.startsWith(UPLOADS_DIR + path.sep) && fullPath !== UPLOADS_DIR) {
    throw new Error('invalid file path')
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(`file not found: ${filename}`)
  }

  return fullPath
}

// ── Public extractors ──────────────────────────────────────────────────────────

/**
 * Extracts plain text from a PDF file stored in UPLOADS_DIR.
 * pdf-parse reads the file buffer and returns a result object with a `.text`
 * property containing all page text concatenated together.
 */
export async function extractPdf(filename: string): Promise<string> {
  // resolveAndValidate throws descriptive errors for path traversal and
  // missing files — those must propagate as-is, not get wrapped below.
  const fullPath = resolveAndValidate(filename)

  try {
    const buffer = fs.readFileSync(fullPath)
    // pdf-parse's bundled pdfjs requires a plain Uint8Array, not a Node Buffer subclass.
    // A Node Buffer may have a non-zero byteOffset inside its underlying ArrayBuffer
    // (Node pools small allocations), which causes pdfjs to read wrong byte positions.
    // Wrapping with Uint8Array(buffer.buffer, byteOffset, length) corrects for this.
    // Cast via `unknown` to satisfy the pdfParse type signature (which declares Buffer)
    // while passing the correctly-offset Uint8Array at runtime.
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const result = await pdfParse(uint8 as unknown as Buffer)
    return normalise(result.text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`failed to extract pdf: ${message}`)
  }
}

/**
 * Extracts plain text from a DOCX file stored in UPLOADS_DIR.
 * mammoth.extractRawText strips all formatting and returns the raw string
 * content — no HTML, no markdown, just words.
 */
export async function extractDocx(filename: string): Promise<string> {
  const fullPath = resolveAndValidate(filename)

  try {
    const result = await mammoth.extractRawText({ path: fullPath })
    return normalise(result.value)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`failed to extract docx: ${message}`)
  }
}

/**
 * Unified entry point used by AI generation routes.
 * Delegates to the correct extractor based on `fileType` from the modules table.
 * All path validation happens inside the individual extractors.
 */
export async function extractText(
  filename: string,
  fileType: 'pdf' | 'docx'
): Promise<string> {
  switch (fileType) {
    case 'pdf':
      return extractPdf(filename)
    case 'docx':
      return extractDocx(filename)
    default: {
      // Exhaustiveness check — TypeScript narrows `fileType` to `never` here,
      // but we cast to string for the runtime error message.
      const unsupported = fileType as string
      throw new Error(`unsupported file type: ${unsupported}`)
    }
  }
}
