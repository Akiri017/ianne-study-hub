import { useState } from 'react'
import WeakPointLog from '../right-panel/WeakPointLog'
import TaskTracker from '../right-panel/TaskTracker'

type PanelTab = 'WEAK POINTS' | 'TASKS'

interface RightPanelProps {
  isOpen: boolean
}

/**
 * Toggleable right panel — 280px wide.
 * Houses two tabs: Weak Points and Tasks.
 */
export default function RightPanel({ isOpen }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('WEAK POINTS')

  if (!isOpen) return null

  return (
    <aside className="w-[280px] h-full bg-bg-surface border-l border-border-default flex flex-col shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-border-default shrink-0">
        {(['WEAK POINTS', 'TASKS'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'flex-1 h-9 font-mono text-xs font-semibold tracking-widest uppercase transition-colors duration-100 px-2',
              activeTab === tab
                ? 'text-text-primary border-b-2 border-accent'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'WEAK POINTS' && <WeakPointLog />}
        {activeTab === 'TASKS' && <TaskTracker />}
      </div>
    </aside>
  )
}
