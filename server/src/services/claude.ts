/**
 * Claude API service — prompt assembly and SSE streaming relay.
 *
 * All Claude API calls go through this module. It is the only place in the
 * server that imports from @anthropic-ai/sdk. Prompt text is never logged.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Response } from 'express'
import { extractText } from './parser'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Model is env-configurable so different environments can override without code changes.
// Defaults to the project-standard Sonnet 4.6 per CLAUDE.md.
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

// ── Prompt builders ────────────────────────────────────────────────────────────

/**
 * Returns the assembled { system, userMessage } for a given output type.
 * Split from streamGeneration so each builder can be unit-tested in isolation.
 */
export function buildPrompt(params: {
  text: string
  outputType: 'prescan' | 'notes' | 'quiz'
  questionCount?: number
  instructions?: string
}): { system: string; userMessage: string } {
  const { text, outputType, questionCount, instructions } = params

  // Append any regeneration instructions to the user message so the system
  // prompt stays stable (required for prompt caching to be effective).
  const userSuffix = instructions ? `\n\nAdditional instructions: ${instructions}` : ''

  switch (outputType) {
    case 'prescan':
      return {
        system: buildPrescanSystem(),
        userMessage: `Generate a pre-scan summary from the following module content:\n\n${text}${userSuffix}`,
      }
    case 'notes':
      return {
        system: buildNotesSystem(),
        userMessage: `Generate structured notes from the following module content:\n\n${text}${userSuffix}`,
      }
    case 'quiz': {
      const count = questionCount ?? 10
      return {
        system: buildQuizSystem(count),
        userMessage: `Generate ${count} quiz questions from the following module content:\n\n${text}${userSuffix}`,
      }
    }
  }
}

/**
 * System prompt for pre-scan output.
 * PRD §9: headings + key terms only, no explanations, 3–5 minute read target.
 */
function buildPrescanSystem(): string {
  return `You are a study assistant that generates pre-scan summaries from academic modules.
Your output must be strictly headings and key terms only — no explanations, no elaboration.
The goal is vocabulary activation before a full reading. Target: readable in 3–5 minutes.
Extract all identifiable concepts regardless of where they appear in the source document.
Do not treat the source document's structure as authoritative.`
}

/**
 * System prompt for structured notes output.
 * PRD §9: bottom-up concept ordering, explicit connections, flag ambiguities.
 */
function buildNotesSystem(): string {
  return `You are a study assistant that generates structured notes from academic modules.
Reorder concepts from the source into a bottom-up learning sequence: foundational definitions first, building toward complex applications.
Make connections between concepts explicit (e.g., "this builds on X").
Flag any concepts that appeared ambiguous or underdeveloped in the source.
Present output in a way that gives both detail and a wide-angle view of the module.
Do not treat the source document's structure as authoritative — reconstruct a logical concept order.`
}

/**
 * System prompt for quiz output.
 * PRD §9 + ARCHITECTURE.md question schema: MCQ + short answer, valid JSON array only.
 */
function buildQuizSystem(questionCount: number): string {
  return `You are a study assistant that generates mock quiz questions from academic modules.
Generate exactly ${questionCount} questions in a mix of MCQ and short-answer formats. You decide the distribution.
Output must be a valid JSON array only — no prose before or after the array.
Each question object must have: id (UUID v4), type ("mcq" or "short_answer"), question (string), choices (array of 4 strings, MCQ only), answer (string), topic (the key concept this tests).
Extract questions from all parts of the module, not just the most prominent sections.`
}

// ── SSE streaming ──────────────────────────────────────────────────────────────

/**
 * Streams a Claude generation to the Express response as Server-Sent Events.
 *
 * Caller must not have sent any headers before calling this — we set
 * Content-Type: text/event-stream here. Returns the full accumulated
 * content so the caller can persist it to the DB after the stream ends.
 *
 * Error handling: if Claude errors after headers are sent, we write a final
 * SSE error event and call res.end(). We do NOT rethrow so Express's error
 * handler never sees a headers-already-sent crash.
 */
export async function streamGeneration(
  res: Response,
  params: {
    text: string
    outputType: 'prescan' | 'notes' | 'quiz'
    questionCount?: number
    instructions?: string
  }
): Promise<string> {
  // Set SSE headers before any streaming begins.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { system, userMessage } = buildPrompt(params)

  let accumulated = ''

  // 30-second hard timeout per PRD §11 NFR — prevents runaway billing.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    // The standard SDK types don't include cache_control on TextBlockParam —
    // it lives in the beta/prompt-caching namespace. We cast through unknown so
    // the runtime call works (the API accepts it on the regular endpoint) while
    // the TypeScript compiler stays happy. See @anthropic-ai/sdk §Prompt Caching.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemWithCache: any = [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' },
      },
    ]

    const stream = anthropic.messages.stream(
      {
        model: MODEL,
        max_tokens: 8192,
        // Prompt caching on the system prompt keeps costs down when the same
        // module is regenerated multiple times (e.g. with different instructions).
        system: systemWithCache,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    )

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text
        accumulated += chunk
        // SSE wire format: each chunk is a JSON-stringified string so the
        // client can safely parse it without worrying about newlines in text.
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }
  } catch (err) {
    // Never log module content — only the error message itself.
    console.error('[claude] streamGeneration error:', err instanceof Error ? err.message : err)

    // Write a final error event so the client knows the stream aborted cleanly
    // rather than timing out on an open connection.
    res.write(`data: ${JSON.stringify({ error: 'generation failed' })}\n\n`)
    res.end()
    return accumulated
  } finally {
    clearTimeout(timeout)
  }

  res.write('data: [DONE]\n\n')
  res.end()

  return accumulated
}

// Re-export extractText so generate routes only need one import.
export { extractText }
