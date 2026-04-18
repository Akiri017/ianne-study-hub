import { useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import StatusBar from './StatusBar'
import RightPanel from './RightPanel'
import { AppContext, type BreadcrumbValue } from '../../lib/app-context'

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
 *   - breadcrumb: real subject/module names pushed up from page components via context
 */
export default function AppShell() {
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [newSubjectOpen, setNewSubjectOpen] = useState(false)
  const [subjectListVersion, setSubjectListVersion] = useState(0)
  // Real names are pushed here by SubjectView / ModuleView via setBreadcrumb in context
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbValue>({})

  // Stable callback so Sidebar/context consumers don't re-render unnecessarily
  const openNewSubject = useCallback(() => setNewSubjectOpen(true), [])

  // Stable setter exposed via context so page components can push real names without prop drilling
  const handleSetBreadcrumb = useCallback((next: BreadcrumbValue) => {
    setBreadcrumb(next)
  }, [])

  // Increment version to signal Sidebar to refetch after a subject is created/deleted
  const handleSubjectCreated = useCallback(() => {
    setSubjectListVersion((v) => v + 1)
  }, [])

  return (
    <AppContext.Provider value={{ openNewSubject, setBreadcrumb: handleSetBreadcrumb }}>
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
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
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
