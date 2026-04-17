/**
 * Unit tests — Gemini service (buildPrompt + streamGeneration).
 *
 * Strategy: vi.stubGlobal('fetch', ...) so we never hit the real Gemini API.
 * streamGeneration is tested with a mock Express Response that collects
 * writes so we can assert on SSE wire format without a real HTTP server.
 *
 * buildPrompt is a pure function — no mocking needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── parser mock (prevents real fs/pdf-parse imports) ──────────────────────────

vi.mock('../services/parser', () => ({
  extractText: vi.fn(),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { buildPrompt, streamGeneration } from '../services/claude'
import type { Response } from 'express'

// ── Global fetch mock ─────────────────────────────────────────────────────────
// Replaced per-test via mockFetch.mockResolvedValueOnce(makeStreamResponse(...))

const mockFetch = vi.fn()

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a fake fetch Response whose body is a ReadableStream emitting the
 * provided SSE lines. Mirrors what Gemini returns with ?alt=sse.
 */
function makeStreamResponse(sseLines: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const line of sseLines) {
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    },
  })
  return new globalThis.Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  }) as unknown as Response
}

/**
 * Serialises a text chunk into the SSE line Gemini emits with ?alt=sse.
 * Format: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
 */
function geminiSseLine(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`
}

/**
 * Builds a mock Express Response that collects res.write() calls.
 */
function makeMockRes() {
  const writes: string[] = []
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => { writes.push(chunk) }),
    end: vi.fn(),
    _writes: writes,
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  vi.resetAllMocks()
  // Re-stub after resetAllMocks clears the stub
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── buildPrompt — prescan ─────────────────────────────────────────────────────

describe('buildPrompt — prescan', () => {
  it('returns system and userMessage', () => {
    const { system, userMessage } = buildPrompt({ text: 'Content', outputType: 'prescan' })
    expect(system).toBeTruthy()
    expect(userMessage).toBeTruthy()
  })

  it('system prompt references pre-scan vocabulary activation', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'prescan' })
    expect(system).toContain('pre-scan')
    expect(system).toContain('headings')
    expect(system).toContain('key terms')
  })

  it('userMessage includes the source text', () => {
    const { userMessage } = buildPrompt({ text: 'Mitosis chapter', outputType: 'prescan' })
    expect(userMessage).toContain('Mitosis chapter')
  })

  it('appends additional instructions to userMessage when provided', () => {
    const { userMessage } = buildPrompt({
      text: 'Content',
      outputType: 'prescan',
      instructions: 'Focus on diagrams only',
    })
    expect(userMessage).toContain('Focus on diagrams only')
    expect(userMessage).toContain('Additional instructions')
  })

  it('does not append instructions text when instructions is undefined', () => {
    const { userMessage } = buildPrompt({ text: 'Content', outputType: 'prescan' })
    expect(userMessage).not.toContain('Additional instructions')
  })
})

// ── buildPrompt — notes ───────────────────────────────────────────────────────

describe('buildPrompt — notes', () => {
  it('system prompt references bottom-up concept ordering', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'notes' })
    expect(system).toContain('bottom-up')
  })

  it('userMessage includes the source text', () => {
    const { userMessage } = buildPrompt({ text: 'Genetics module', outputType: 'notes' })
    expect(userMessage).toContain('Genetics module')
  })

  it('system prompt mentions flagging ambiguities', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'notes' })
    expect(system).toContain('ambiguous')
  })
})

// ── buildPrompt — quiz ────────────────────────────────────────────────────────

describe('buildPrompt — quiz', () => {
  it('includes question count in both system and userMessage', () => {
    const { system, userMessage } = buildPrompt({
      text: 'Quiz content',
      outputType: 'quiz',
      questionCount: 5,
    })
    expect(system).toContain('5')
    expect(userMessage).toContain('5 quiz questions')
  })

  it('defaults question count to 10 when questionCount is undefined', () => {
    const { system, userMessage } = buildPrompt({ text: 'x', outputType: 'quiz' })
    expect(system).toContain('10')
    expect(userMessage).toContain('10 quiz questions')
  })

  it('system prompt specifies JSON array output format', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'quiz', questionCount: 3 })
    expect(system).toContain('JSON array')
  })

  it('system prompt specifies mcq and short_answer types', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'quiz', questionCount: 3 })
    expect(system).toContain('mcq')
    expect(system).toContain('short_answer')
  })

  it('userMessage includes source text', () => {
    const { userMessage } = buildPrompt({
      text: 'Enzyme kinetics',
      outputType: 'quiz',
      questionCount: 2,
    })
    expect(userMessage).toContain('Enzyme kinetics')
  })
})

// ── streamGeneration — SSE headers ───────────────────────────────────────────

describe('streamGeneration — SSE headers', () => {
  it('sets Content-Type text/event-stream, Cache-Control, and Connection before writing', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([geminiSseLine('Hi')]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(res.flushHeaders).toHaveBeenCalled()
  })
})

// ── streamGeneration — Gemini request format ──────────────────────────────────

describe('streamGeneration — Gemini request format', () => {
  it('calls fetch with POST method and JSON content-type', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('streamGenerateContent')
    expect(url).toContain('alt=sse')
    expect(options.method).toBe('POST')
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('sends system_instruction and user contents in the request body', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'my module text', outputType: 'prescan' })

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as {
      system_instruction: { parts: Array<{ text: string }> }
      contents: Array<{ role: string; parts: Array<{ text: string }> }>
    }

    expect(body.system_instruction.parts[0].text).toBeTruthy()
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts[0].text).toContain('my module text')
  })

  it('includes maxOutputTokens in generationConfig', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'notes' })

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string) as { generationConfig: { maxOutputTokens: number } }
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(0)
  })
})

// ── streamGeneration — chunk writing ─────────────────────────────────────────

describe('streamGeneration — chunk writing', () => {
  it('extracts text from Gemini chunks and writes as JSON-stringified SSE lines', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([
      geminiSseLine('Hello '),
      geminiSseLine('world'),
    ]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain(`data: ${JSON.stringify('Hello ')}\n\n`)
    expect(res._writes).toContain(`data: ${JSON.stringify('world')}\n\n`)
  })

  it('skips lines that are not valid Gemini SSE data', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([
      'data: [DONE]\n\n',           // skip — [DONE] sentinel
      'data: not-json\n\n',         // skip — malformed
      geminiSseLine('Real chunk'),  // emit
      '\n',                         // skip — empty line
    ]))

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const chunkWrites = res._writes.filter((w) => w !== 'data: [DONE]\n\n')
    expect(chunkWrites).toHaveLength(1)
    expect(result).toBe('Real chunk')
  })

  it('skips Gemini events where text field is missing', async () => {
    const noText = `data: ${JSON.stringify({ candidates: [{ content: { parts: [] } }] })}\n\n`
    mockFetch.mockResolvedValueOnce(makeStreamResponse([
      noText,
      geminiSseLine('Valid'),
    ]))

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(result).toBe('Valid')
  })
})

// ── streamGeneration — done sentinel ─────────────────────────────────────────

describe('streamGeneration — done sentinel', () => {
  it('writes [DONE] sentinel and calls res.end() on success', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([geminiSseLine('Done text')]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain('data: [DONE]\n\n')
    expect(res.end).toHaveBeenCalledOnce()
  })

  it('accumulates and returns the full generated content', async () => {
    mockFetch.mockResolvedValueOnce(makeStreamResponse([
      geminiSseLine('Part1 '),
      geminiSseLine('Part2'),
    ]))

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'notes' })

    expect(result).toBe('Part1 Part2')
  })
})

// ── streamGeneration — error handling ────────────────────────────────────────

describe('streamGeneration — error handling', () => {
  it('writes SSE error event and ends response when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const errorWrite = res._writes.find((w) => w.includes('"error"'))
    expect(errorWrite).toBeDefined()
    expect(res.end).toHaveBeenCalled()
  })

  it('writes SSE error event when Gemini returns a non-200 status', async () => {
    const errorResponse = new globalThis.Response('{"error":"quota exceeded"}', {
      status: 429,
    })
    mockFetch.mockResolvedValueOnce(errorResponse)

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const errorWrite = res._writes.find((w) => w.includes('"error"'))
    expect(errorWrite).toBeDefined()
    expect(res.end).toHaveBeenCalled()
  })

  it('does NOT write [DONE] sentinel when stream errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('failure'))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).not.toContain('data: [DONE]\n\n')
  })

  it('does not rethrow errors (caller safety net)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('should not propagate'))

    const res = makeMockRes()
    await expect(
      streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })
    ).resolves.toBeDefined()
  })
})
