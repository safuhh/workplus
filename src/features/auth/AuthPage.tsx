/**
 * AuthPage — sign-in and sign-up forms using Supabase email/password auth
 * with full Dark/Light theme support, browser password-manager integration,
 * autofill compatibility, and Remember Me session persistence.
 */

import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase/client'
import { getRememberMePreference, setRememberMePreference } from '../../lib/supabase/authStorage'
import { useAuth } from './context'
import { ThemeToggle } from '../theme/ThemeToggle'
import { Clock } from 'lucide-react'

type Mode = 'signin' | 'signup'

export function AuthPage() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('workpulse_saved_email') || ''
      } catch {
        return ''
      }
    }
    return ''
  })
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setSubmitting(true)

    // Read values from form DOM to support password managers that autofill DOM elements directly
    const form = e.currentTarget
    const formData = new FormData(form)
    const submittedEmail = (
      (formData.get('username') as string) ||
      (formData.get('email') as string) ||
      email
    ).trim()
    const submittedPassword = (formData.get('password') as string) || password

    try {
      // Set the session persistence preference before authentication
      setRememberMePreference(rememberMe)

      if (rememberMe) {
        try {
          localStorage.setItem('workpulse_saved_email', submittedEmail)
        } catch {
          // Ignore storage quota errors
        }
      } else {
        try {
          localStorage.removeItem('workpulse_saved_email')
        } catch {
          // Ignore
        }
      }

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: submittedEmail,
          password: submittedPassword,
        })
        if (error) throw error
        setSuccessMsg('Account created successfully. You can now sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: submittedEmail,
          password: submittedPassword,
        })
        if (error) {
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error('Invalid email or password. Please verify your credentials and try again.')
          }
          throw error
        }

        // Signal to the browser password manager (Chrome, Edge, Safari) that login succeeded
        if (
          typeof window !== 'undefined' &&
          'PasswordCredential' in window &&
          navigator.credentials &&
          typeof navigator.credentials.store === 'function'
        ) {
          try {
            // @ts-expect-error - PasswordCredential is standard in modern browsers
            const cred = new window.PasswordCredential({
              id: submittedEmail,
              password: submittedPassword,
              name: submittedEmail,
            })
            void navigator.credentials.store(cred)
          } catch {
            // Non-blocking fallback
          }
        }
        // AuthContext will update session automatically via onAuthStateChange
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected authentication error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-4 transition-colors duration-200 relative">
      {/* Theme toggle in top right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle showLabel />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-brand-600 rounded-2xl p-3 mb-4 shadow-lg">
            <Clock className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">WorkPulse</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Personal work-time tracker</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 transition-colors">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          {error && (
            <div
              className="mb-4 rounded-lg bg-warn-50 dark:bg-warn-950/40 border border-warn-100 dark:border-warn-900/60 text-warn-600 dark:text-warn-300 text-sm px-4 py-3"
              role="alert"
            >
              {error}
            </div>
          )}
          {successMsg && (
            <div
              className="mb-4 rounded-lg bg-work-50 dark:bg-work-950/40 border border-work-100 dark:border-work-900/60 text-work-700 dark:text-work-300 text-sm px-4 py-3"
              role="status"
            >
              {successMsg}
            </div>
          )}

          {/* Standard HTML login form for browser password-manager & autofill support */}
          <form
            id="login-form"
            name="login"
            method="post"
            action="#"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email
              </label>
              <input
                id="email"
                name="username"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="Enter your email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {/* Remember Me Checkbox */}
            {mode === 'signin' && (
              <div className="flex items-center justify-between pt-0.5">
                <label
                  htmlFor="remember-me"
                  className="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-brand-600 focus:ring-brand-500 dark:focus:ring-offset-slate-900 cursor-pointer accent-brand-600 transition"
                  />
                  <span>Remember me</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 cursor-pointer shadow-xs"
            >
              {submitting
                ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
                : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null) }}
                  className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium focus:outline-none cursor-pointer"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null); setSuccessMsg(null) }}
                  className="text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium focus:outline-none cursor-pointer"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
