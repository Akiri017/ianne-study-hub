import { useEffect, useState } from 'react'

interface StatusBarProps {
  subject?: string
  module?: string
  isStreaming?: boolean
}

/** Pad a number to two digits — used for HH:MM formatting */
function pad(n: number) {
  return String(n).padStart(2, '0')
}

function getCurrentTime() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * 24px status bar pinned to the bottom of the app.
 * Left: context path. Center: streaming/save indicator. Right: clock.
 */
export default function StatusBar({ subject, module, isStreaming = false }: StatusBarProps) {
  const [time, setTime] = useState(getCurrentTime)

  // Update clock every minute — aligned to the next minute boundary for accuracy
  useEffect(() => {
    const now = new Date()
    // Wait until the start of the next minute, then tick every 60s
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()

    const timeout = setTimeout(() => {
      setTime(getCurrentTime())
      const interval = setInterval(() => setTime(getCurrentTime()), 60_000)
      return () => clearInterval(interval)
    }, msUntilNextMinute)

    return () => clearTimeout(timeout)
  }, [])

  const contextPath = [subject, module].filter(Boolean).join(' › ')

  return (
    <footer className="h-6 w-full flex items-center px-3 bg-bg-surface border-t border-border-default shrink-0">
      <div className="flex-1 min-w-0">
        {contextPath && (
          <span className="font-mono text-xs text-text-muted truncate">{contextPath}</span>
        )}
      </div>

      {/* Center — streaming indicator */}
      <div className="flex-1 flex justify-center">
        {isStreaming && (
          <span className="font-mono text-xs text-accent animate-pulse flex items-center gap-1">
            <span>●</span>
            <span>STREAMING</span>
          </span>
        )}
      </div>

      {/* Right — clock */}
      <div className="flex-1 flex justify-end">
        <span className="font-mono text-xs text-text-muted">{time}</span>
      </div>
    </footer>
  )
}
