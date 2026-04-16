/**
 * Express route smoke tests — subjects router.
 *
 * We spin up a minimal Express app (no real DB) that mounts only the subjects
 * router and the error handler. This avoids pulling in db/index.ts (which opens
 * a real file) while still testing that the router is correctly wired.
 *
 * Uses Node 18+ built-in fetch; no supertest required.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import express from 'express'
import subjectsRouter from '../routes/subjects'
import { errorHandler } from '../middleware/error-handler'

let server: http.Server
let baseUrl: string

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api/subjects', subjectsRouter)
    app.use(errorHandler)

    // Ephemeral port — avoids conflicts with a running dev server
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

describe('GET /api/subjects', () => {
  it('returns 200 with { subjects: [] } on a stub router', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`)
    expect(res.status).toBe(200)
    const body = await res.json() as { subjects: unknown[] }
    expect(body).toHaveProperty('subjects')
    expect(Array.isArray(body.subjects)).toBe(true)
    expect(body.subjects).toHaveLength(0)
  })

  it('responds with Content-Type: application/json', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
  })
})

describe('POST /api/subjects', () => {
  it('returns 201 on the stub router', async () => {
    const res = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Subject' }),
    })
    expect(res.status).toBe(201)
  })
})

describe('DELETE /api/subjects/:id', () => {
  it('returns 200 with { deleted: true } on the stub router', async () => {
    const res = await fetch(`${baseUrl}/api/subjects/1`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { deleted: boolean }
    expect(body.deleted).toBe(true)
  })
})

describe('Unknown routes', () => {
  it('unregistered route returns 404 (Express default), not an unhandled crash', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`)
    // Express returns 404 by default for unregistered routes
    expect(res.status).toBe(404)
  })
})
