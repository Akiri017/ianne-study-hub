// Typed fetch wrappers for all API routes
// Populated in later tasks as routes are implemented

const BASE_URL = '/api'

// Generic JSON fetcher with error handling
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export interface Subject {
  id: number
  name: string
  created_at: string
}

/** Fetch all subjects, ordered by creation time ascending. */
export const getSubjects = (): Promise<{ subjects: Subject[] }> =>
  fetch('/api/subjects').then((r) => r.json())

/** Create a new subject. Throws on network failure; server errors are in the response body. */
export const createSubject = (name: string): Promise<{ subject: Subject } | { error: string }> =>
  fetch('/api/subjects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => r.json())

/** Delete a subject by id. Returns { deleted: true } or { error: string }. */
export const deleteSubject = (id: number): Promise<{ deleted: boolean } | { error: string }> =>
  fetch(`/api/subjects/${id}`, { method: 'DELETE' }).then((r) => r.json())

export { request }
