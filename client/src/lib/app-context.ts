import { createContext, useContext } from 'react'

/**
 * Lightweight app-level context for actions that need to be triggered
 * from page-level components but whose state lives in AppShell.
 *
 * Kept minimal — only add to this context when prop-drilling through
 * Outlet would be the only alternative.
 */

export interface BreadcrumbValue {
  subject?: string
  module?: string
}

interface AppContextValue {
  /** Opens the New Subject modal owned by AppShell/Sidebar. */
  openNewSubject: () => void
  /**
   * Called by page components to push real subject/module names into the
   * Topbar breadcrumb. Pass an empty object to clear the breadcrumb when
   * navigating away (e.g. in a useEffect cleanup).
   */
  setBreadcrumb: (breadcrumb: BreadcrumbValue) => void
}

export const AppContext = createContext<AppContextValue>({
  // Safe no-op defaults — pages rendered outside AppShell won't crash
  openNewSubject: () => {},
  setBreadcrumb: () => {},
})

export const useAppContext = () => useContext(AppContext)
