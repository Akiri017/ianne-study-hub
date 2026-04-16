import { Request, Response, NextFunction } from 'express'

// Centralised error handler — must be registered last in Express middleware chain
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  console.error('[error]', err.message, err.stack)

  res.status(500).json({
    error: err.message ?? 'Internal server error',
  })
}
