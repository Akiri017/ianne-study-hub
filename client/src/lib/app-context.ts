import { createContext, useContext } from 'react'

/**
 * Lightweight app-level context for actions that need to be triggered
 * from page-level components but whose state lives in AppShell.
 *
 * Kept minimal — only add to this context when prop-drilling through
 * Outlet would be the only alternative.
 */
interface AppContextValue {
  /** Opens the New Subject modal owned by AppShell/Sidebar. */
  openNewSubject: () => void
}

export const AppContext = createContext<AppContextValue>({
  // Safe no-op default — pages rendered outside AppShell won't crash
  openNewSubject: () => {},
})

export const useAppContext = () => useContext(AppContext)
