/**
 * Custom auth storage adapter for Supabase client.
 *
 * Implements Supabase's SupportedStorage interface to provide:
 * 1. Persistent storage (localStorage) when "Remember Me" is enabled,
 *    keeping the user logged in across browser refreshes and browser restarts.
 * 2. Session-based storage (sessionStorage) when "Remember Me" is disabled,
 *    keeping the user logged in across page refreshes within the same browser session,
 *    but automatically terminating the session when the browser / tab is closed.
 *
 * Passwords are NEVER stored. Only Supabase's standard JWT tokens pass through this adapter.
 */

export const REMEMBER_ME_KEY = 'workpulse_remember_me'

/**
 * Returns true if the user opted to be remembered across browser restarts.
 * Defaults to true for standard login UX.
 */
export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const val = localStorage.getItem(REMEMBER_ME_KEY)
    return val !== 'false'
  } catch {
    return true
  }
}

/**
 * Persists the user's Remember Me preference.
 */
export function setRememberMePreference(remember: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false')
    if (!remember) {
      // If disabled, remove preference from sessionStorage if present
      sessionStorage.setItem(REMEMBER_ME_KEY, 'false')
    } else {
      sessionStorage.removeItem(REMEMBER_ME_KEY)
    }
  } catch {
    // Ignore storage quota or access errors in restrictive browser environments
  }
}

/**
 * Clears the user's Remember Me preference.
 */
export function clearRememberMePreference(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(REMEMBER_ME_KEY)
    sessionStorage.removeItem(REMEMBER_ME_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Supabase-compatible storage adapter that routes between localStorage and sessionStorage.
 */
export const authStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      const isRemembered = localStorage.getItem(REMEMBER_ME_KEY)

      // 1. If explicitly set to remember (or default/initial state with no preference yet)
      if (isRemembered === 'true' || isRemembered === null) {
        const localItem = localStorage.getItem(key)
        if (localItem) return localItem
      }

      // 2. Check sessionStorage (used when remember me is disabled, or as fallback)
      const sessionItem = sessionStorage.getItem(key)
      if (sessionItem) return sessionItem

      // 3. Fallback to localStorage only if remember me was NOT explicitly disabled
      if (isRemembered !== 'false') {
        return localStorage.getItem(key)
      }

      return null
    } catch {
      return null
    }
  },

  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return
    try {
      const isRemembered = localStorage.getItem(REMEMBER_ME_KEY)
      const shouldRemember = isRemembered !== 'false'

      if (shouldRemember) {
        // Persist across browser restarts
        localStorage.setItem(key, value)
        sessionStorage.removeItem(key)
      } else {
        // Keep strictly in session storage (cleared on browser/tab close)
        sessionStorage.setItem(key, value)
        localStorage.removeItem(key)
      }
    } catch {
      // Ignore
    }
  },

  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // Ignore
    }
  },
}

