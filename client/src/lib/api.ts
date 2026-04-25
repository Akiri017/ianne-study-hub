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

/** Delete a subject by id. Throws on non-2xx with the server error message. */
export async function deleteSubject(id: number): Promise<void> {
  const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

export { request }

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export interface Module {
  id: number
  subject_id: number
  title: string
  file_type: 'pdf' | 'docx'
  created_at: string
  /** Outputs already generated for this module, indexed by output_type. */
  outputs: AiOutput[]
}

/** Fetch all modules for a subject, each with their associated outputs. */
export const getModules = (subjectId: number): Promise<{ modules: Module[] }> =>
  fetch(`/api/subjects/${subjectId}/modules`).then((r) => r.json())

/**
 * Upload a PDF or DOCX file as a new module under a subject.
 * Uses multipart/form-data — do NOT set Content-Type header manually;
 * the browser sets it with the correct multipart boundary.
 */
export const uploadModule = (
  subjectId: number,
  file: File,
  title: string
): Promise<{ module: { id: number; subject_id: number; title: string; file_type: string; created_at: string } }> => {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  return fetch(`/api/subjects/${subjectId}/modules/upload`, {
    method: 'POST',
    body: form,
  }).then((r) => r.json())
}

/** Delete a module by id. */
export const deleteModule = (id: number): Promise<{ deleted: boolean } | { error: string }> =>
  fetch(`/api/modules/${id}`, { method: 'DELETE' }).then((r) => r.json())

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

// ---------------------------------------------------------------------------
// Weak Points
// ---------------------------------------------------------------------------

export interface WeakPoint {
  id: number
  subject_id: number
  topic: string
  what_went_wrong: string
  why_missed: string
  fix: string
  status: 'Open' | 'Patched' | 'Confirmed'
  created_at: string
  updated_at: string
}

export const getWeakPoints = (subjectId: number, status?: string): Promise<{ weak_points: WeakPoint[] }> => {
  const url = status
    ? `/api/subjects/${subjectId}/weak-points?status=${encodeURIComponent(status)}`
    : `/api/subjects/${subjectId}/weak-points`
  return fetch(url).then((r) => r.json())
}

export const createWeakPoint = (
  subjectId: number,
  data: Omit<WeakPoint, 'id' | 'subject_id' | 'created_at' | 'updated_at'>
): Promise<{ weak_point: WeakPoint } | { error: string }> =>
  fetch(`/api/subjects/${subjectId}/weak-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.json())

export const updateWeakPoint = (
  id: number,
  data: Partial<Omit<WeakPoint, 'id' | 'subject_id' | 'created_at' | 'updated_at'>>
): Promise<{ weak_point: { id: number; updated_at: string } } | { error: string }> =>
  fetch(`/api/weak-points/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((r) => r.json())

export const deleteWeakPoint = (id: number): Promise<{ deleted: boolean } | { error: string }> =>
  fetch(`/api/weak-points/${id}`, { method: 'DELETE' }).then((r) => r.json())

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface Task {
  id: number
  subject_id: number | null
  title: string
  due_date: string // YYYY-MM-DD
  completed: boolean
  subject_name?: string | null
}

export const getTasks = (): Promise<{ tasks: Task[] }> =>
  request('/tasks')

export const createTask = (
  data: { title: string; due_date: string; subject_id?: number }
): Promise<{ task: Task } | { error: string }> =>
  request('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateTask = (
  id: number,
  data: Partial<{ title: string; due_date: string; completed: boolean; subject_id: number | null }>
): Promise<{ task: { id: number } } | { error: string }> =>
  request(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteTask = (id: number): Promise<{ deleted: boolean } | { error: string }> =>
  request(`/tasks/${id}`, { method: 'DELETE' })

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStats {
  open_weak_points: number
  total_modules: number
  recent_modules: Array<{
    id: number
    title: string
    subject_id: number
    subject_name: string | null
    file_type: 'pdf' | 'docx'
    created_at: string
  }>
}

export const getDashboardStats = (): Promise<DashboardStats> =>
  fetch('/api/subjects/stats').then((r) => r.json())

// ---------------------------------------------------------------------------
// Quizzes & FA Sessions
// ---------------------------------------------------------------------------

export interface QuizQuestion {
  id: string
  type: 'mcq' | 'short_answer'
  question: string
  choices?: string[]
  answer: string
  topic: string
}

export interface Quiz {
  id: number
  title: string
  question_count: number
  questions: QuizQuestion[]
  created_at: string
  /** subject_id of the first linked module. null for quizzes with no module link. */
  subject_id: number | null
}

export interface QuizSummary {
  id: number
  title: string
  question_count: number
  created_at: string
}

export interface FaSession {
  id: number
  quiz_id: number
  score: number
  total: number
  answers_json: string
  completed_at: string | null
}

export interface SessionAnswer {
  question_id: string
  user_answer: string
  correct: boolean
}

export const getQuiz = (id: number): Promise<{ quiz: Quiz }> =>
  fetch(`/api/quizzes/${id}`).then((r) => r.json())

export const getSubjectQuizzes = (subjectId: number): Promise<{ quizzes: QuizSummary[] }> =>
  fetch(`/api/subjects/${subjectId}/quizzes`).then((r) => r.json())

export const createSession = (quizId: number): Promise<{ session: FaSession }> =>
  request(`/quizzes/${quizId}/sessions`, { method: 'POST', body: '{}' })

export const completeSession = (
  quizId: number,
  sessionId: number,
  data: { score: number; answers: SessionAnswer[] }
): Promise<{ session: FaSession }> =>
  request(`/quizzes/${quizId}/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reviewer export
// ---------------------------------------------------------------------------

/**
 * Exports a reviewer document for a subject's Confirmed weak points.
 * Returns a Blob (the raw DOCX or PDF binary).
 * Throws if the server returns a non-2xx response, with the JSON error message.
 */
export async function exportReviewer(
  subjectId: number,
  format: 'docx' | 'pdf'
): Promise<Blob> {
  const res = await fetch(`/api/subjects/${subjectId}/reviewer/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format }),
  })

  if (!res.ok) {
    // Error bodies are JSON — read and re-throw with the message
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }

  return res.blob()
}

// ---------------------------------------------------------------------------
// AI — quiz weak point reason generation
// ---------------------------------------------------------------------------

export interface WrongAnswerInput {
  id: string
  question: string
  correctAnswer: string
  userAnswer: string
  topic: string
}

export interface WhyMissedResult {
  id: string
  why_missed: string
}

/**
 * Sends all wrong answers to Gemini in a single call and returns a why_missed
 * explanation for each question.
 * Throws on network failure or non-2xx response.
 */
export async function generateQuizWeakPointReasons(
  questions: WrongAnswerInput[]
): Promise<WhyMissedResult[]> {
  const res = await fetch('/api/ai/quiz-weak-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { results: WhyMissedResult[] }
  return data.results
}

/**
 * Bulk-creates weak points for a subject in a single DB transaction.
 * Returns the count of inserted rows.
 * Throws on network failure or non-2xx response.
 */
export async function bulkCreateWeakPoints(
  subjectId: number,
  weakPoints: Array<{
    topic: string
    what_went_wrong: string
    why_missed: string
    fix: string
    status: string
  }>
): Promise<{ inserted: number }> {
  const res = await fetch(`/api/subjects/${subjectId}/weak-points/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weak_points: weakPoints }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<{ inserted: number }>
}

/** Create a multi-module quiz synchronously. Returns quiz metadata or an error. */
export const createMultiModuleQuiz = (params: {
  module_ids: number[]
  question_count: number
  title?: string
}): Promise<{ quiz_id: number; title: string; question_count: number } | { error: string }> =>
  fetch('/api/generate/multi-module-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).then((r) => r.json())
