import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Dispatch, SetStateAction } from 'react'
import { useChatStreamingBuffer } from './useChatStreamingBuffer'

interface TestMsg {
  id: string
  content: string
}

/** Creates a vi.fn() mock typed as React's state setter for TestMsg arrays. */
function makeSetMessages() {
  return vi.fn() as unknown as Dispatch<SetStateAction<TestMsg[]>> & {
    mock: { calls: Array<[SetStateAction<TestMsg[]>]> }
  }
}

describe('useChatStreamingBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Stub requestAnimationFrame to run the callback synchronously so tests
    // don't require real animation frames.
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => {
        cb(0)
        return 1
      }
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('initialises with empty streaming state', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    expect(result.current.streamContentRef.current.size).toBe(0)
    expect(result.current.streamRafRef.current).toBeNull()
    expect(result.current.streamStatus).toBeNull()
    expect(result.current.activityLog).toEqual([])
    expect(result.current.liveMcpToolCalls).toEqual([])
  })

  it('appendStreamingDelta accumulates content and calls setMessages', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    act(() => {
      result.current.appendStreamingDelta('msg-1', 'Hello')
      result.current.appendStreamingDelta('msg-1', ' world')
    })

    expect(result.current.streamContentRef.current.get('msg-1')).toBe('Hello world')
    // setMessages should have been called via the rAF stub flush
    expect(vi.mocked(setMessages)).toHaveBeenCalled()
  })

  it('flushStreamingContent updates messages via setMessages', () => {
    const messages: TestMsg[] = [
      { id: 'msg-1', content: '' },
      { id: 'msg-2', content: 'unchanged' },
    ]
    const setMessages = makeSetMessages()

    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    act(() => {
      result.current.streamContentRef.current.set('msg-1', 'streamed content')
      result.current.flushStreamingContent()
    })

    // flushStreamingContent always passes a function updater to setMessages
    const calls = vi.mocked(setMessages).mock.calls
    const updaterCall = calls.find(([arg]) => typeof arg === 'function')
    expect(updaterCall).toBeDefined()
    const updated = (updaterCall![0] as (prev: TestMsg[]) => TestMsg[])(messages)
    expect(updated[0].content).toBe('streamed content')
    expect(updated[1].content).toBe('unchanged')
  })

  it('flushStreamingContent is a no-op when the buffer is empty', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    act(() => {
      result.current.flushStreamingContent()
    })

    expect(vi.mocked(setMessages)).not.toHaveBeenCalled()
  })

  it('clearStreamingBuffers cancels pending rAF and clears the map', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    // Manually seed refs to simulate a pending flush
    act(() => {
      result.current.streamContentRef.current.set('msg-1', 'partial')
      result.current.streamRafRef.current = 42
      result.current.clearStreamingBuffers()
    })

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
    expect(result.current.streamContentRef.current.size).toBe(0)
    expect(result.current.streamRafRef.current).toBeNull()
  })

  it('setStreamStatus updates streamStatus state', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    act(() => {
      result.current.setStreamStatus('Processing...')
    })

    expect(result.current.streamStatus).toBe('Processing...')
  })

  it('setActivityLog appends log entries', () => {
    const setMessages = makeSetMessages()
    const { result } = renderHook(() =>
      useChatStreamingBuffer<TestMsg>(setMessages)
    )

    act(() => {
      result.current.setActivityLog((prev) => [...prev, 'step 1'])
      result.current.setActivityLog((prev) => [...prev, 'step 2'])
    })

    expect(result.current.activityLog).toEqual(['step 1', 'step 2'])
  })
})
