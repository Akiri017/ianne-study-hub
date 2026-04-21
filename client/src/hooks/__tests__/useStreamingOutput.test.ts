import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStreamingOutput } from '../useStreamingOutput'

// A small helper to create a mocked reader
function createMockReader(chunks: string[]) {
  let index = 0
  return {
    read: vi.fn().mockImplementation(async () => {
      if (index >= chunks.length) {
        return { done: true, value: undefined }
      }
      const chunk = chunks[index]
      index++
      // Return value as Uint8Array
      return { done: false, value: new TextEncoder().encode(chunk) }
    }),
  }
}

describe('useStreamingOutput', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useStreamingOutput())
    
    expect(result.current.state).toBe('idle')
    expect(result.current.content).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.outputId).toBeNull()
  })

  it('should process chunked data streams correctly', async () => {
    const { result } = renderHook(() => useStreamingOutput())
    
    const chunks = [
      'data: "Hello"\n',
      'data: " World"\n',
      'data: [DONE]\n'
    ]
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => createMockReader(chunks),
      }
    })

    await act(async () => {
      await result.current.startStream('/api/test', { prompt: 'hi' })
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ prompt: 'hi' })
    }))

    expect(result.current.state).toBe('done')
    expect(result.current.content).toBe('Hello World')
    expect(result.current.error).toBeNull()
  })

  it('should handle pre-flight JSON HTTP errors', async () => {
    const { result } = renderHook(() => useStreamingOutput())
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: 'Validation failed' }),
    })

    await act(async () => {
      await result.current.startStream('/api/test', {})
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('Validation failed')
    expect(result.current.content).toBe('')
  })

  it('should handle in-stream error JSON events', async () => {
    const { result } = renderHook(() => useStreamingOutput())
    
    const chunks = [
      'data: "Part 1"\n',
      'data: {"error": "Stream interrupted"}\n' // server signals error mid-stream
    ]
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => createMockReader(chunks),
      }
    })

    await act(async () => {
      await result.current.startStream('/api/test', {})
    })

    expect(result.current.state).toBe('error')
    expect(result.current.content).toBe('Part 1')
    expect(result.current.error).toBe('Stream interrupted')
  })

  it('should reset stream to idle state correctly', async () => {
    const { result } = renderHook(() => useStreamingOutput())
    
    const chunks = [
      'data: "Done"\n',
      'data: [DONE]\n'
    ]
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => createMockReader(chunks),
      }
    })

    await act(async () => {
      await result.current.startStream('/api/test', {})
    })
    
    expect(result.current.state).toBe('done')
    
    act(() => {
      result.current.reset()
    })
    
    expect(result.current.state).toBe('idle')
    expect(result.current.content).toBe('')
    expect(result.current.outputId).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
