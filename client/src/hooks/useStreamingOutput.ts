/**
 * useStreamingOutput — SSE consumer for AI generation endpoints.
 *
 * Connects to a POST endpoint that returns a text/event-stream response.
 * Each SSE data line is a JSON-stringified string chunk; the sentinel
 * `[DONE]` signals end of stream. An `{ error: string }` data line signals
 * a server-side generation failure.
 *
 * Usage:
 *   const { state, content, startStream, reset } = useStreamingOutput()
 *   startStream('/api/modules/1/generate', { output_type: 'notes' })
 */

import { useState, useCallback } from 'react'

export type StreamState = 'idle' | 'streaming' | 'done' | 'error'

export interface UseStreamingOutputReturn {
  /** Current state of the stream lifecycle. */
  state: StreamState
  /** Accumulated generated content so far. Updates on every chunk. */
  content: string
  /** Not populated by the stream itself — caller can set via reset(). Reserved for future use. */
  outputId: number | null
  /** Error message if state === 'error'. */
  error: string | null
  /** Open an SSE stream to the given URL with the given POST body. */
  startStream: (url: string, body: object) => Promise<void>
  /** Reset all state back to 'idle'. Call before re-triggering generation. */
  reset: () => void
}

export function useStreamingOutput(): UseStreamingOutputReturn {
  const [state, setState] = useState<StreamState>('idle')
  const [content, setContent] = useState('')
  const [outputId, setOutputId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startStream = useCallback(async (url: string, body: object) => {
    setState('streaming')
    setContent('')
    setOutputId(null)
    setError(null)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok || !response.body) {
        // Before headers are flushed (e.g. 400/404 validation errors), the
        // server returns a normal JSON error body — parse and surface it.
        const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorBody.error ?? `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // Split on newlines but keep the incomplete last line in the buffer.
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6) // strip 'data: '

          if (data === '[DONE]') {
            setState('done')
            return
          }

          try {
            const parsed: unknown = JSON.parse(data)

            if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
              // Server signalled a generation failure mid-stream.
              setError((parsed as { error: string }).error)
              setState('error')
              return
            }

            if (typeof parsed === 'string') {
              accumulated += parsed
              setContent(accumulated)
            }
          } catch {
            // Non-JSON line (e.g. empty comment lines) — skip silently.
          }
        }
      }

      // If the ReadableStream ended without a [DONE] sentinel (e.g. network drop),
      // treat it as done rather than leaving the UI stuck in 'streaming'.
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setContent('')
    setOutputId(null)
    setError(null)
  }, [])

  return { state, content, outputId, error, startStream, reset }
}
