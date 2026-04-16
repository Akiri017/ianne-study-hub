/**
 * Ambient module declaration for multer 2.x.
 *
 * multer 2.x does not ship .d.ts files. This shim covers the subset of the
 * multer API used in this project (diskStorage, fileFilter, single()).
 *
 * Global Express.Request augmentation (req.file / req.files) lives in
 * express-multer.d.ts to keep the two concerns separate.
 */

declare module 'multer' {
  import { Request, Response } from 'express'

  type File = Express.Multer.File

  interface Options {
    storage?: StorageEngine
    dest?: string
    limits?: {
      fieldSize?: number
      fields?: number
      fileSize?: number
      files?: number
      parts?: number
      headerPairs?: number
    }
    preservePath?: boolean
    fileFilter?: (
      req: Request,
      file: File,
      callback: (error: Error | null, acceptFile?: boolean) => void
    ) => void
  }

  interface StorageEngine {
    _handleFile(
      req: Request,
      file: File,
      callback: (error?: Error | null, info?: Partial<File>) => void
    ): void
    _removeFile(
      req: Request,
      file: File,
      callback: (error: Error | null) => void
    ): void
  }

  interface DiskStorageOptions {
    destination?:
      | string
      | ((
          req: Request,
          file: File,
          callback: (error: Error | null, destination: string) => void
        ) => void)
    filename?: (
      req: Request,
      file: File,
      callback: (error: Error | null, filename: string) => void
    ) => void
  }

  interface Instance {
    single(fieldname: string): (
      req: Request,
      res: Response,
      callback: (error?: Error) => void
    ) => void
    array(fieldname: string, maxCount?: number): (
      req: Request,
      res: Response,
      callback: (error?: Error) => void
    ) => void
    none(): (req: Request, res: Response, callback: (error?: Error) => void) => void
  }

  interface Multer {
    (options?: Options): Instance
    diskStorage(options: DiskStorageOptions): StorageEngine
  }

  const multer: Multer
  export = multer
}
