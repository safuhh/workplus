import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthPage } from '../AuthPage'
import { ThemeProvider } from '../../theme/ThemeProvider'
import {
  authStorage,
  getRememberMePreference,
  setRememberMePreference,
  clearRememberMePreference,
  REMEMBER_ME_KEY,
} from '../../../lib/supabase/authStorage'
import { supabase } from '../../../lib/supabase/client'
import * as authContext from '../context'

vi.mock('../context', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../../lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
  },
  isSupabaseConfigured: true,
}))

describe('Remember Me - authStorage Adapter', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearRememberMePreference()
    vi.clearAllMocks()
  })

  it('defaults to true when no preference is set', () => {
    expect(getRememberMePreference()).toBe(true)
  })

  it('persists preference in localStorage when setRememberMePreference is called', () => {
    setRememberMePreference(false)
    expect(getRememberMePreference()).toBe(false)
    expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe('false')

    setRememberMePreference(true)
    expect(getRememberMePreference()).toBe(true)
    expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe('true')
  })

  it('saves session to localStorage when Remember Me is enabled', () => {
    setRememberMePreference(true)

    const testTokenKey = 'sb-test-auth-token'
    const testSessionData = JSON.stringify({ access_token: 'xyz-access-token', user: { id: 'u1' } })

    authStorage.setItem(testTokenKey, testSessionData)

    // Should be in localStorage
    expect(localStorage.getItem(testTokenKey)).toBe(testSessionData)
    // Should NOT be in sessionStorage
    expect(sessionStorage.getItem(testTokenKey)).toBeNull()

    // Can be retrieved
    expect(authStorage.getItem(testTokenKey)).toBe(testSessionData)
  })

  it('retains session across simulated browser restart when Remember Me is enabled', () => {
    setRememberMePreference(true)

    const testTokenKey = 'sb-test-auth-token'
    const testSessionData = JSON.stringify({ access_token: 'persistent-token' })
    authStorage.setItem(testTokenKey, testSessionData)

    // Simulate browser restart: sessionStorage is wiped by the OS/browser
    sessionStorage.clear()

    // getItem still retrieves the session from localStorage
    expect(authStorage.getItem(testTokenKey)).toBe(testSessionData)
  })

  it('saves session to sessionStorage and wipes localStorage when Remember Me is disabled', () => {
    setRememberMePreference(false)

    const testTokenKey = 'sb-test-auth-token'
    const testSessionData = JSON.stringify({ access_token: 'session-only-token' })

    authStorage.setItem(testTokenKey, testSessionData)

    // Should be in sessionStorage
    expect(sessionStorage.getItem(testTokenKey)).toBe(testSessionData)
    // Should NOT be in localStorage
    expect(localStorage.getItem(testTokenKey)).toBeNull()

    // In the active browser session, it can be retrieved (persists on refresh)
    expect(authStorage.getItem(testTokenKey)).toBe(testSessionData)
  })

  it('discards session after browser restart when Remember Me is disabled', () => {
    setRememberMePreference(false)

    const testTokenKey = 'sb-test-auth-token'
    const testSessionData = JSON.stringify({ access_token: 'session-only-token' })
    authStorage.setItem(testTokenKey, testSessionData)

    // Simulate browser restart: browser closes and clears sessionStorage
    sessionStorage.clear()

    // Because Remember Me was disabled, localStorage has no token
    expect(authStorage.getItem(testTokenKey)).toBeNull()
  })

  it('removeItem clears token from both localStorage and sessionStorage on logout', () => {
    const testTokenKey = 'sb-test-auth-token'
    const testSessionData = JSON.stringify({ access_token: 'logout-test' })

    localStorage.setItem(testTokenKey, testSessionData)
    sessionStorage.setItem(testTokenKey, testSessionData)

    authStorage.removeItem(testTokenKey)

    expect(localStorage.getItem(testTokenKey)).toBeNull()
    expect(sessionStorage.getItem(testTokenKey)).toBeNull()
    expect(authStorage.getItem(testTokenKey)).toBeNull()
  })
})

describe('Remember Me - AuthPage UI Integration', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    })

    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: 'u1' } as never, session: { access_token: 'token' } as never },
      error: null,
    })
  })

  it('renders Remember Me checkbox in sign-in mode with label', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    expect(checkbox).toBeDefined()
    expect((checkbox as HTMLInputElement).checked).toBe(true)
  })

  it('toggles Remember Me checkbox on user click', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const checkbox = screen.getByRole('checkbox', { name: /remember me/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('stores remember_me=true preference on form submission when checkbox is checked', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitBtn = screen.getByRole('button', { name: /^sign in$/i })

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      })
      expect(getRememberMePreference()).toBe(true)
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe('true')
    })
  })

  it('stores remember_me=false preference on form submission when checkbox is unchecked', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    const submitBtn = screen.getByRole('button', { name: /^sign in$/i })

    // Uncheck Remember Me
    fireEvent.click(checkbox)

    fireEvent.change(emailInput, { target: { value: 'session_user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'session_user@example.com',
        password: 'password123',
      })
      expect(getRememberMePreference()).toBe(false)
      expect(localStorage.getItem(REMEMBER_ME_KEY)).toBe('false')
    })
  })
})
