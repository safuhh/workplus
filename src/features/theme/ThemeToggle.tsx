import { Sun, Moon } from 'lucide-react'
import { useTheme } from './context'

interface ThemeToggleProps {
  className?: string
  showLabel?: boolean
}

export function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const { theme, isDark, toggleTheme } = useTheme()

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer ${className}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 text-slate-600 transition-transform duration-200" />
      )}
      {showLabel && (
        <span className="text-xs font-medium">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </button>
  )
}

