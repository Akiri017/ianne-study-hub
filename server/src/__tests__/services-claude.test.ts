/**
 * Unit tests — claude service (buildPrompt + streamGeneration).
 *
 * Strategy: vi.mock @anthropic-ai/sdk so we never hit the real API.
 * streamGeneration is tested with a mock Express Response that collects
 * writes so we can assert on SSE wire format without a real HTTP server.
 *
 * buildPrompt is a pure function — no mocking needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoist mock references so they're available inside vi.mock factory ────────

const mockStreamFn = vi.hoisted(() => vi.fn())

// ── @anthropic-ai/sdk mock ───────────────────────────────────────────────────
// Must use a regular function (not arrow) so `new Anthropic()` works as a constructor.
// When a constructor function explicitly returns an object, JS uses that object.

vi.mock('@anthropic-ai/sdk', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: function MockAnthropic(this: any) {
    return {
      messages: {
        stream: mockStreamFn,
      },
    }
  },
}))

// ── parser mock (prevents real fs/pdf-parse imports) ─────────────────────────

vi.mock('../services/parser', () => ({
  extractText: vi.fn(),
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import { buildPrompt, streamGeneration } from '../services/claude'
import type { Response } from 'express'

// ── Mock Response factory ─────────────────────────────────────────────────────

function makeMockRes() {
  const writes: string[] = []
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk)
    }),
    end: vi.fn(),
    _writes: writes,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ── buildPrompt ───────────────────────────────────────────────────────────────

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

// ── streamGeneration ──────────────────────────────────────────────────────────

describe('streamGeneration — SSE headers', () => {
  it('sets Content-Type text/event-stream before any writes', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(res.flushHeaders).toHaveBeenCalled()
  })
})

describe('streamGeneration — chunk writing', () => {
  it('writes each text chunk as a JSON-stringified SSE data line', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } }
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain(`data: ${JSON.stringify('Hello ')}\n\n`)
    expect(res._writes).toContain(`data: ${JSON.stringify('world')}\n\n`)
  })

  it('ignores non-text-delta events without writing them', async () => {
    async function* events() {
      // These should be silently skipped
      yield { type: 'message_start', message: {} }
      yield { type: 'content_block_start', content_block: { type: 'text' } }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Only me' } }
      yield { type: 'message_stop' }
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, {
      text: 'x',
      outputType: 'prescan',
    })

    // Only one chunk write + DONE sentinel
    const chunkWrites = res._writes.filter((w) => w !== 'data: [DONE]\n\n')
    expect(chunkWrites).toHaveLength(1)
    expect(result).toBe('Only me')
  })
})

describe('streamGeneration — done sentinel', () => {
  it('writes [DONE] sentinel and calls res.end() on success', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Complete' } }
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).toContain('data: [DONE]\n\n')
    expect(res.end).toHaveBeenCalledOnce()
  })

  it('accumulates and returns the full generated content', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Part1 ' } }
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Part2' } }
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, {
      text: 'x',
      outputType: 'notes',
    })

    expect(result).toBe('Part1 Part2')
  })
})

describe('streamGeneration — error handling', () => {
  it('writes SSE error event and ends response when stream throws', async () => {
    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        throw new Error('Claude API failure')
      },
    })

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    const errorWrite = res._writes.find((w) => w.includes('"error"'))
    expect(errorWrite).toBeDefined()
    expect(res.end).toHaveBeenCalled()
  })

  it('does NOT write [DONE] sentinel when stream errors', async () => {
    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        throw new Error('failure')
      },
    })

    const res = makeMockRes()
    await streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })

    expect(res._writes).not.toContain('data: [DONE]\n\n')
  })

  it('returns accumulated content from before the error on mid-stream failure', async () => {
    async function* events() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial ' } }
      throw new Error('mid-stream failure')
    }
    mockStreamFn.mockReturnValueOnce(events())

    const res = makeMockRes()
    const result = await streamGeneration(res as unknown as Response, {
      text: 'x',
      outputType: 'prescan',
    })

    expect(result).toBe('Partial ')
  })

  it('does not rethrow errors (caller safety net)', async () => {
    mockStreamFn.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        throw new Error('should not propagate')
      },
    })

    const res = makeMockRes()
    // Must resolve, not reject
    await expect(
      streamGeneration(res as unknown as Response, { text: 'x', outputType: 'prescan' })
    ).resolves.toBeDefined()
  })
})
