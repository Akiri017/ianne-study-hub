/**
 * Gemini API service — prompt assembly and SSE streaming relay.
 *
 * Uses the Vertex AI REST endpoint directly via Node's built-in fetch.
 * No SDK dependency — matches the curl-style API the project uses.
 *
 * External interface is identical to the previous Anthropic implementation:
 * streamGeneration() and buildPrompt() signatures are unchanged so all
 * callers (routes/generate.ts) require zero modification.
 *
 * Prompt text is never logged.
 */

import type { Response } from 'express'
import { extractText } from './parser'

// ── Config ─────────────────────────────────────────────────────────────────────

const API_KEY = process.env.GOOGLE_API_KEY
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash'

// Vertex AI "publishers/google/models" endpoint — works with a Google AI Studio
// API key (obtained from console.cloud.google.com/vertex-ai/studio).
// ?alt=sse tells the API to return Server-Sent Events instead of a raw JSON array,
// which is the same wire format our client already parses.
const GEMINI_BASE_URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models'

// ── Gemini response shape (partial — only the fields we read) ──────────────────

interface GeminiChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
}

// ── Prompt builders ─────────────────────────────────────────────────────────────

/**
 * Returns the assembled { system, userMessage } for a given output type.
 * Split from streamGeneration so each builder can be unit-tested in isolation.
 * Prompts are identical to the previous implementation — only the delivery
 * mechanism (Gemini vs Anthropic) has changed.
 */
export function buildPrompt(params: {
  text: string
  outputType: 'prescan' | 'notes' | 'quiz'
  questionCount?: number
  instructions?: string
}): { system: string; userMessage: string } {
  const { text, outputType, questionCount, instructions } = params

  // Append any regeneration instructions to the user message so the system
  // prompt stays stable across regenerations.
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

// ── SSE streaming ───────────────────────────────────────────────────────────────

/**
 * Streams a Gemini generation to the Express response as Server-Sent Events.
 *
 * Calls the Vertex AI streamGenerateContent endpoint with ?alt=sse so the
 * upstream response is already in SSE format. We parse each event, extract
 * the text chunk, and re-emit it to our client in the same format the
 * useStreamingOutput hook already knows how to consume:
 *
 *   data: "chunk text"\n\n   ← JSON-stringified string per chunk
 *   data: [DONE]\n\n         ← sentinel on completion
 *   data: {"error":"..."}\n\n ← sentinel on failure
 *
 * Returns the full accumulated content so the caller can persist it to the DB.
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
    const url = `${GEMINI_BASE_URL}/${MODEL}:streamGenerateContent?key=${API_KEY}&alt=sse`

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Gemini separates system instructions from user content at the top level.
        system_instruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 8192,
        },
      }),
      signal: controller.signal,
    })

    if (!upstream.ok || !upstream.body) {
      // Read the error body for logging (never log user content).
      const errText = await upstream.text().catch(() => '')
      throw new Error(`Gemini API error ${upstream.status}: ${errText.slice(0, 200)}`)
    }

    // Read the SSE stream from Gemini and relay chunks to our client.
    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split on newlines but keep any incomplete final line in the buffer.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()

        // Gemini may or may not send [DONE] — we handle the stream-end via
        // the reader loop above, so just skip it if present.
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data) as GeminiChunk
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text

          if (typeof text === 'string' && text.length > 0) {
            accumulated += text
            // Re-emit to client in the same format useStreamingOutput expects.
            res.write(`data: ${JSON.stringify(text)}\n\n`)
          }
        } catch {
          // Malformed JSON line (e.g. Gemini metadata-only events) — skip silently.
        }
      }
    }
  } catch (err) {
    // Never log module content — only the error message.
    console.error('[gemini] streamGeneration error:', err instanceof Error ? err.message : err)

    // Write a final error event so the client knows the stream aborted cleanly.
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
