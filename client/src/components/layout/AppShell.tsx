import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import StatusBar from './StatusBar'
import RightPanel from './RightPanel'

/**
 * Root layout wrapper. Renders the persistent shell around all page content.
 *
 * Structure:
 *   Topbar (48px, full width)
 *   ├── Sidebar (240px) | <Outlet /> (flex-1) | RightPanel (280px, toggleable)
 *   StatusBar (24px, full width)
 *
 * Right panel open state lives here so both Topbar (toggle button) and
 * RightPanel (visibility) can share it without prop-drilling through pages.
 */
export default function AppShell() {
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const location = useLocation()

  // Build breadcrumb from URL — expanded in later tasks when subject/module routes exist
  // For now the dashboard route has no breadcrumb segments
  const breadcrumb = buildBreadcrumb(location.pathname)

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-base">
      <Topbar
        breadcrumb={breadcrumb}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
      />

      {/* Middle row — sidebar + content + right panel */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />

        {/* Main content — scrolls independently */}
        <main className="flex-1 overflow-y-auto bg-bg-base">
          <Outlet />
        </main>

        <RightPanel isOpen={rightPanelOpen} />
      </div>

      <StatusBar
        subject={breadcrumb.subject}
        module={breadcrumb.module}
        isStreaming={false}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Breadcrumb builder — naive path-based parsing.
// Subject/module names will be derived from route state or context in later tasks.
// ---------------------------------------------------------------------------

interface Breadcrumb {
  subject?: string
  module?: string
}

function buildBreadcrumb(pathname: string): Breadcrumb {
  // Dashboard
  if (pathname === '/') return {}

  // /subjects/:id  →  show "Subject" (name resolved in Subject View task)
  // /subjects/:id/modules/:moduleId  →  resolved in Module View task
  // Return empty for now; real resolution happens when those routes are built.
  return {}
}
