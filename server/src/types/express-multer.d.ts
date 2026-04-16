/**
 * Global Express.Request augmentation for multer file fields.
 *
 * Separate from multer.d.ts to avoid the 'script vs module' ambiguity that
 * arises when a file contains both a declare module block and declare global.
 *
 * This file has no imports or exports so TypeScript treats it as a global
 * script and the declaration merging takes effect immediately.
 */

declare namespace Express {
  namespace Multer {
    /** A single uploaded file as populated by multer middleware. */
    interface File {
      fieldname: string
      originalname: string
      encoding: string
      mimetype: string
      size: number
      destination: string
      filename: string
      path: string
      buffer: Buffer
      stream: NodeJS.ReadableStream
    }
  }

  // Augment the base Request interface so req.file is typed everywhere.
  // This merges into express-serve-static-core's Request which express exports.
  interface Request {
    file?: Multer.File
    files?: { [fieldname: string]: Multer.File[] } | Multer.File[] | undefined
  }
}
