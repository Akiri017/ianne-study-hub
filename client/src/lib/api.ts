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

// ---------------------------------------------------------------------------
// AI Outputs
// ---------------------------------------------------------------------------

export interface AiOutput {
  id: number
  module_id: number
  output_type: 'prescan' | 'notes' | 'quiz'
  content: string
  instructions: string | null
  created_at: string
  updated_at: string
}

/**
 * Trigger SSE generation for a single module.
 * Returns the raw Response — caller must consume the stream via useStreamingOutput
 * or read the body directly. Do NOT call .json() on this response.
 */
export const generateOutput = (
  moduleId: number,
  params: {
    output_type: 'prescan' | 'notes' | 'quiz'
    question_count?: number
    instructions?: string
  }
): Promise<Response> =>
  fetch(`/api/modules/${moduleId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

/** Fetch a single ai_output record by id. */
export const getOutput = (id: number): Promise<{ output: AiOutput }> =>
  fetch(`/api/outputs/${id}`).then((r) => r.json())

/** Save inline edits to an output's content. */
export const patchOutput = (
  id: number,
  content: string
): Promise<{ output: { id: number; updated_at: string } }> =>
  fetch(`/api/outputs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }).then((r) => r.json())

/**
 * Regenerate an existing output with updated instructions.
 * Returns the raw Response — same SSE stream pattern as generateOutput.
 */
export const regenerateOutput = (
  outputId: number,
  instructions: string
): Promise<Response> =>
  fetch(`/api/outputs/${outputId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions }),
  })
