import { useState, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import StatusBar from './StatusBar'
import RightPanel from './RightPanel'
import { AppContext } from '../../lib/app-context'

/**
 * Root layout wrapper. Renders the persistent shell around all page content.
 *
 * Structure:
 *   Topbar (48px, full width)
 *   ├── Sidebar (240px) | <Outlet /> (flex-1) | RightPanel (280px, toggleable)
 *   StatusBar (24px, full width)
 *
 * State that lives here (owned at this level because it spans multiple children):
 *   - rightPanelOpen: shared between Topbar toggle and RightPanel visibility
 *   - newSubjectOpen: New Subject modal state — Sidebar renders the modal but
 *     DashboardPage can trigger it via AppContext without prop drilling through Outlet
 */
export default function AppShell() {
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [newSubjectOpen, setNewSubjectOpen] = useState(false)
  const [subjectListVersion, setSubjectListVersion] = useState(0)
  const location = useLocation()

  // Build breadcrumb from URL — expanded in later tasks when subject/module routes exist
  const breadcrumb = buildBreadcrumb(location.pathname)

  // Stable callback so Sidebar/context consumers don't re-render unnecessarily
  const openNewSubject = useCallback(() => setNewSubjectOpen(true), [])

  // Increment version to signal Sidebar to refetch after a subject is created/deleted
  const handleSubjectCreated = useCallback(() => {
    setSubjectListVersion((v) => v + 1)
  }, [])

  return (
    <AppContext.Provider value={{ openNewSubject }}>
      <div className="h-screen flex flex-col overflow-hidden bg-bg-base">
        <Topbar
          breadcrumb={breadcrumb}
          onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
          rightPanelOpen={rightPanelOpen}
        />

        {/* Middle row — sidebar + content + right panel */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          <Sidebar
            newSubjectOpen={newSubjectOpen}
            setNewSubjectOpen={setNewSubjectOpen}
            onSubjectCreated={handleSubjectCreated}
            subjectListVersion={subjectListVersion}
          />

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
    </AppContext.Provider>
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
  // Dashboard — no breadcrumb
  if (pathname === '/') return {}

  // /subjects/:subjectId/modules/:moduleId
  // Show Subject ID › Module ID. Real names come from ModuleView via router
  // state — full name resolution is a follow-up task (PM: wire via context).
  const moduleMatch = pathname.match(/^\/subjects\/(\d+)\/modules\/(\d+)/)
  if (moduleMatch) {
    return {
      subject: `Subject ${moduleMatch[1]}`,
      module: `Module ${moduleMatch[2]}`,
    }
  }

  // /subjects/:subjectId
  const subjectMatch = pathname.match(/^\/subjects\/(\d+)/)
  if (subjectMatch) {
    return { subject: `Subject ${subjectMatch[1]}` }
  }

  return {}
}
