/**
 * Multer 2.x upload middleware configuration.
 *
 * Why: Multer 1.x (1.4.5-lts.x) has known ReDoS and path traversal
 * vulnerabilities. This project uses multer ^2.0.0 which resolves those.
 *
 * Validates both MIME type AND file extension (both must agree) to prevent
 * spoofed content-type uploads.
 */

import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTENSIONS = ['.pdf', '.docx']

// Ensure the uploads directory exists when the module is first loaded.
// Using recursive so it handles nested paths without throwing if it already exists.
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    // Prefix with 16 random hex bytes so names are collision-resistant.
    // We keep the original extension (lowercased) for readability.
    const ext = path.extname(file.originalname).toLowerCase()
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${ext}`
    cb(null, uniqueName)
  },
})

// Reject files whose MIME type or extension is not on the allowlist.
// Both checks must pass — this guards against extension spoofing and
// against tools that lie about MIME type.
// Explicit parameter types instead of inferring from multer.Options['fileFilter']
// because TypeScript cannot resolve `multer` as a namespace when imported via
// esModuleInterop default import with an `export = ...` style declaration.
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile?: boolean) => void
): void => {
  const ext = path.extname(file.originalname).toLowerCase()
  const mimeOk = ALLOWED_MIME_TYPES.includes(file.mimetype)
  const extOk = ALLOWED_EXTENSIONS.includes(ext)

  if (mimeOk && extOk) {
    cb(null, true)
  } else {
    // Passing an Error as first arg causes multer to abort the upload and
    // forward the error to the Express error handler (or the route catch block).
    cb(new Error('unsupported file type'))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
})
