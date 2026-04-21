/**
 * Modules routes — file upload, listing, and deletion.
 *
 * Routes:
 *   GET  /api/subjects/:subjectId/modules          — list modules with output stubs
 *   POST /api/subjects/:subjectId/modules/upload   — upload PDF/DOCX, insert module row
 *   DELETE /api/modules/:id                        — remove file from disk + DB row
 */

import { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { upload, UPLOADS_DIR } from '../middleware/upload'
import db from '../db/index'

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine the stored file_type value from the uploaded file's extension.
 * Returns null if the extension is unrecognised (upload middleware should have
 * already rejected unsupported types, but this is a defensive fallback).
 */
function fileTypeFromExt(filename: string): 'pdf' | 'docx' | null {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  return null
}

/**
 * Resolve a stored filename to an absolute path and verify it stays inside
 * UPLOADS_DIR to prevent path traversal.
 *
 * Returns null if the resolved path escapes UPLOADS_DIR.
 */
function safeResolvePath(filename: string): string | null {
  // Normalise to strip any embedded `..` segments
  const resolved = path.resolve(UPLOADS_DIR, filename)
  // Guard: the resolved path must still start with the uploads directory
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) && resolved !== UPLOADS_DIR) {
    return null
  }
  return resolved
}

// ── Subject-scoped router (mounted at /api/subjects/:subjectId/modules) ──────

const router = Router({ mergeParams: true })

// ---------------------------------------------------------------------------
// GET /api/subjects/:subjectId/modules
// Returns all modules for a subject, each including their ai_output stubs.
// ---------------------------------------------------------------------------
router.get('/', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    // Verify the subject exists first so we can return 404 instead of empty list
    const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)
    if (!subject) {
      res.status(404).json({ error: 'not found' })
      return
    }

    const modules = db.prepare(
      'SELECT id, title, file_type, created_at FROM modules WHERE subject_id = ? ORDER BY created_at ASC'
    ).all(subjectId) as Array<{ id: number; title: string; file_type: string; created_at: string }>

    // Attach ai_output stubs for each module so the client knows what has been generated
    const modulesWithOutputs = modules.map((mod) => {
      const outputs = db.prepare(
        'SELECT id, output_type, content, updated_at FROM ai_outputs WHERE module_id = ? ORDER BY created_at ASC'
      ).all(mod.id)

      return { ...mod, outputs }
    })

    res.json({ modules: modulesWithOutputs })
  } catch (err) {
    console.error('[modules] GET / error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/subjects/:subjectId/modules/upload
// Body: multipart/form-data — field `file` (PDF|DOCX ≤20MB), field `title`
// ---------------------------------------------------------------------------
router.post('/upload', (req: Request, res: Response) => {
  const subjectId = Number(req.params.subjectId)

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  // Run multer middleware manually so we can handle its errors inline and
  // return our own shaped error responses instead of forwarding to errorHandler.
  upload.single('file')(req, res, (err?: Error) => {
    // ── Multer error handling ────────────────────────────────────────────────
    if (err) {
      const message = err instanceof Error ? err.message : String(err)

      // Map multer's own error codes to spec-defined response bodies
      if (message === 'unsupported file type') {
        res.status(400).json({ error: 'unsupported file type' })
        return
      }

      // Multer 2.x throws a plain Error with message containing 'LIMIT_FILE_SIZE'
      // when the fileSize limit is exceeded.
      if (message.includes('LIMIT_FILE_SIZE')) {
        res.status(400).json({ error: 'file too large' })
        return
      }

      console.error('[modules] upload middleware error:', err)
      res.status(500).json({ error: 'Internal server error' })
      return
    }

    // ── Post-multer validation ───────────────────────────────────────────────
    try {
      // Verify the subject exists
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId)
      if (!subject) {
        // If multer already saved a file we should clean it up so we don't
        // leave orphaned files on disk
        if (req.file) {
          fs.unlink(req.file.path, () => { /* best-effort cleanup */ })
        }
        res.status(404).json({ error: 'not found' })
        return
      }

      // title is a form field — it arrives on req.body after multer parses it
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      if (!title) {
        if (req.file) {
          fs.unlink(req.file.path, () => { /* best-effort cleanup */ })
        }
        res.status(400).json({ error: 'title is required' })
        return
      }

      if (!req.file) {
        res.status(400).json({ error: 'file is required' })
        return
      }

      // Determine file_type from the saved file's name (which uses the original extension)
      const fileType = fileTypeFromExt(req.file.filename)
      if (!fileType) {
        // Shouldn't reach here because fileFilter would have rejected it, but be safe
        fs.unlink(req.file.path, () => { /* best-effort cleanup */ })
        res.status(400).json({ error: 'unsupported file type' })
        return
      }

      // Store only the filename (not the full absolute path) so the DB is
      // portable across machine relocations
      const filePath = req.file.filename

      // Insert the module row
      const result = db.prepare(
        'INSERT INTO modules (subject_id, title, file_path, file_type) VALUES (?, ?, ?, ?)'
      ).run(subjectId, title, filePath, fileType)

      const module = db.prepare(
        'SELECT id, subject_id, title, file_type, created_at FROM modules WHERE id = ?'
      ).get(result.lastInsertRowid as number)

      res.status(201).json({ module })
    } catch (err) {
      console.error('[modules] POST /upload error:', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })
})

// ── Standalone module router (mounted at /api/modules) ───────────────────────

export const deleteModule = Router()

// ---------------------------------------------------------------------------
// DELETE /api/modules/:id
// Removes the physical file from disk (best-effort) then deletes the DB row.
// Cascade in schema removes associated ai_outputs automatically.
// ---------------------------------------------------------------------------
deleteModule.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' })
    return
  }

  try {
    const mod = db.prepare(
      'SELECT id, file_path FROM modules WHERE id = ?'
    ).get(id) as { id: number; file_path: string } | undefined

    if (!mod) {
      res.status(404).json({ error: 'not found' })
      return
    }

    // Resolve the stored filename to an absolute path and verify it is safe
    // before touching the filesystem.
    const safePath = safeResolvePath(mod.file_path)

    if (safePath) {
      // Attempt to remove the file; swallow ENOENT so a missing file on disk
      // never blocks a DB deletion (files might have been manually removed).
      try {
        fs.unlinkSync(safePath)
      } catch (unlinkErr: unknown) {
        const code = (unlinkErr as NodeJS.ErrnoException).code
        if (code !== 'ENOENT') {
          // Log unexpected unlink errors but still proceed with DB deletion
          console.error('[modules] DELETE file unlink error:', unlinkErr)
        }
      }
    } else {
      // Path escaped uploads dir — log and skip file deletion, still remove DB row
      console.warn('[modules] DELETE /:id — path traversal detected for file_path:', mod.file_path)
    }

    // Delete the DB row — FK cascade removes ai_outputs
    db.prepare('DELETE FROM modules WHERE id = ?').run(id)

    res.json({ deleted: true })
  } catch (err) {
    console.error('[modules] DELETE /:id error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
