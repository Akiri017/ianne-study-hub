/**
 * Gemini API service — prompt assembly and SSE streaming relay.
 *
 * Uses the @google/genai SDK with a Google AI Studio API key.
 * External interface (streamGeneration, generateText, buildPrompt) is
 * unchanged so all callers require zero modification.
 *
 * Prompt text is never logged.
 */

import { GoogleGenAI } from '@google/genai'
import type { Response } from 'express'
import { extractText } from './parser'

// ── Config ─────────────────────────────────────────────────────────────────────

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview'

// Initialised once at module load — safe for the lifetime of the server process.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// ── Prompt builders ─────────────────────────────────────────────────────────────

export function buildPrompt(params: {
  text: string
  outputType: 'prescan' | 'notes' | 'quiz'
  questionCount?: number
  instructions?: string
}): { system: string; userMessage: string } {
  const { text, outputType, questionCount, instructions } = params
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

function buildPrescanSystem(): string {
  return `You are a study assistant that generates pre-scan summaries from academic modules.
Your output must be strictly headings and key terms only — no explanations, no elaboration.
The goal is vocabulary activation before a full reading. Target: readable in 3–5 minutes.
Extract all identifiable concepts regardless of where they appear in the source document.
Do not treat the source document's structure as authoritative.
Formatting rules: use Markdown headings (##, ###) and bullet points only. Never use LaTeX or math notation (no \\(...\\), \\[...\\], $...$, or $$...$$) — write all terms and expressions in plain text.`
}

function buildNotesSystem(): string {
  return `You are a study assistant that generates structured notes from academic modules.
Reorder concepts from the source into a bottom-up learning sequence: foundational definitions first, building toward complex applications.
Make connections between concepts explicit (e.g., "this builds on X").
Flag any concepts that appeared ambiguous or underdeveloped in the source.
Present output in a way that gives both detail and a wide-angle view of the module.
Do not treat the source document's structure as authoritative — reconstruct a logical concept order.
Formatting rules: use Markdown headings (##, ###) and bullet points to structure the notes clearly. Never use LaTeX or math notation (no \\(...\\), \\[...\\], $...$, or $$...$$) — write all equations, formulas, and expressions in plain readable text.`
}

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
 * Iterates the SDK's async generator and re-emits each text chunk to the
 * client in the format useStreamingOutput expects:
 *
 *   data: "chunk text"\n\n   ← JSON-stringified string per chunk
 *   data: [DONE]\n\n         ← sentinel on completion
 *   data: {"error":"..."}\n\n ← sentinel on failure
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
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const { system, userMessage } = buildPrompt(params)
  let accumulated = ''

  // 30-second hard timeout — aborts the stream if Gemini stalls.
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true }, 30_000)

  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      config: { systemInstruction: system },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })

    for await (const chunk of stream) {
      if (timedOut) throw new Error('Generation timed out after 30s')
      const text = chunk.text
      if (typeof text === 'string' && text.length > 0) {
        accumulated += text
        res.write(`data: ${JSON.stringify(text)}\n\n`)
      }
    }
  } catch (err) {
    console.error('[gemini] streamGeneration error:', err instanceof Error ? err.message : err)
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

// ── Non-streaming generation ────────────────────────────────────────────────────

/**
 * Non-streaming Gemini call. Returns the full generated text as a string.
 * Used for multi-module quiz generation where we don't need real-time relay.
 */
export async function generateText(params: {
  text: string
  outputType: 'prescan' | 'notes' | 'quiz'
  questionCount?: number
  instructions?: string
}): Promise<string> {
  const { system, userMessage } = buildPrompt(params)

  // 60s timeout — multi-module inputs are larger than single-module requests.
  let timedOut = false
  const timeout = setTimeout(() => { timedOut = true }, 60_000)

  try {
    if (timedOut) throw new Error('Generation timed out after 60s')

    const response = await ai.models.generateContent({
      model: MODEL,
      config: { systemInstruction: system },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })

    return response.text ?? ''
  } finally {
    clearTimeout(timeout)
  }
}
