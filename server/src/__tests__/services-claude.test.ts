/**
 * Unit tests — Gemini service (buildPrompt + streamGeneration).
 *
 * Strategy: vi.mock('@google/genai') replaces the SDK so we never hit the
 * real API. streamGeneration is tested with a mock Express Response that
 * collects writes so we can assert on SSE wire format.
 *
 * buildPrompt is a pure function — no mocking needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── SDK mock — vi.hoisted ensures these refs exist when the factory runs ──────

const { mockGenerateContentStream, mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContentStream: vi.fn(),
  mockGenerateContent: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  // Regular function (not arrow) so `new GoogleGenAI()` works as a constructor.
  GoogleGenAI: vi.fn(function () {
    return {
      models: {
        generateContentStream: mockGenerateContentStream,
        generateContent: mockGenerateContent,
      },
    }
  }),
}))

// ── parser mock (prevents real fs/pdf-parse imports) ─────────────────────────

vi.mock('../services/parser', () => ({
  extractText: vi.fn(),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { buildPrompt, streamGeneration } from '../services/claude'
import type { Response } from 'express'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns an async iterable that yields { text } objects for each chunk.
 * Mirrors what the SDK's generateContentStream async generator yields.
 */
function makeStream(texts: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of texts) {
        yield { text }
      }
    },
  }
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
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
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

  it('system prompt forbids LaTeX', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'prescan' })
    expect(system).toContain('LaTeX')
    expect(system).toContain('plain text')
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

  it('system prompt forbids LaTeX', () => {
    const { system } = buildPrompt({ text: 'x', outputType: 'notes' })
    expect(system).toContain('LaTeX')
    expect(system).toContain('plain readable text')
  })
})

// ── buildPrompt — quiz ────────────────────────────────────────────────────────

describe('buildPrompt — quiz', () => {
  it('includes question count in both system and userMessage', () => {
    const { system, userMessage } = buildPrompt({ text: 'Quiz content', outputType: 'quiz', questionCount: 5 })
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
})

// ── streamGeneration — SSE headers ───────────────────────────────────────────

describe('streamGeneration — SSE headers', () => {
  it('sets Content-Type, Cache-Control, and Connection before writing', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream(['Hi']))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(res.flushHeaders).toHaveBeenCalled()
  })
})

// ── streamGeneration — SDK request format ─────────────────────────────────────

describe('streamGeneration — SDK request format', () => {
  it('calls generateContentStream with model, systemInstruction, and user content', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream([]))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'my module text', outputType: 'prescan' })

    expect(mockGenerateContentStream).toHaveBeenCalledOnce()
    const [callArgs] = mockGenerateContentStream.mock.calls[0] as [{
      model: string
      config: { systemInstruction: string }
      contents: Array<{ role: string; parts: Array<{ text: string }> }>
    }]

    expect(typeof callArgs.model).toBe('string')
    expect(callArgs.config.systemInstruction).toBeTruthy()
    expect(callArgs.contents[0].role).toBe('user')
    expect(callArgs.contents[0].parts[0].text).toContain('my module text')
  })
})

// ── streamGeneration — chunk writing ─────────────────────────────────────────

describe('streamGeneration — chunk writing', () => {
  it('writes each chunk as a JSON-stringified SSE line', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream(['Hello ', 'world']))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain(`data: ${JSON.stringify('Hello ')}\n\n`)
    expect(res._writes).toContain(`data: ${JSON.stringify('world')}\n\n`)
  })

  it('skips chunks where text is empty', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream(['', 'Real chunk']))

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const chunkWrites = res._writes.filter((w) => w !== 'data: [DONE]\n\n')
    expect(chunkWrites).toHaveLength(1)
    expect(result).toBe('Real chunk')
  })

  it('accumulates and returns the full generated content', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream(['Part1 ', 'Part2']))

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'notes' })

    expect(result).toBe('Part1 Part2')
  })
})

// ── streamGeneration — done sentinel ─────────────────────────────────────────

describe('streamGeneration — done sentinel', () => {
  it('writes [DONE] sentinel and calls res.end() on success', async () => {
    mockGenerateContentStream.mockResolvedValueOnce(makeStream(['Done text']))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain('data: [DONE]\n\n')
    expect(res.end).toHaveBeenCalledOnce()
  })
})

// ── streamGeneration — error handling ────────────────────────────────────────

describe('streamGeneration — error handling', () => {
  it('writes SSE error event and ends response when SDK throws', async () => {
    mockGenerateContentStream.mockRejectedValueOnce(new Error('network failure'))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const errorWrite = res._writes.find((w) => w.includes('"error"'))
    expect(errorWrite).toBeDefined()
    expect(res.end).toHaveBeenCalled()
  })

  it('does NOT write [DONE] sentinel when stream errors', async () => {
    mockGenerateContentStream.mockRejectedValueOnce(new Error('failure'))

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).not.toContain('data: [DONE]\n\n')
  })

  it('does not rethrow errors (caller safety net)', async () => {
    mockGenerateContentStream.mockRejectedValueOnce(new Error('should not propagate'))

    const res = makeMockRes()
    await expect(
      streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })
    ).resolves.toBeDefined()
  })
})
