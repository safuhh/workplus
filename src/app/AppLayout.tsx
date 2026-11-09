/**
 * AppLayout — persistent navigation shell for WorkPulse with Dark/Light theme support.
 */

import { NavLink, Outlet } from 'react-router-dom'
import { Clock, History, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../features/auth/context'
import { ThemeToggle } from '../features/theme/ThemeToggle'

export function AppLayout() {
  const { signOut, user } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top navigation */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-colors duration-200 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="bg-brand-600 rounded-lg p-1.5 shadow-xs">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight">WorkPulse</span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </NavLink>
          </nav>

          {/* Right controls: Theme toggle + User info + Sign out */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden md:block truncate max-w-32">
              {user?.email}
            </span>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
