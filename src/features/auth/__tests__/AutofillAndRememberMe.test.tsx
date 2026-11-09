import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthPage } from '../AuthPage'
import { ThemeProvider } from '../../theme/ThemeProvider'
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

describe('AuthPage - Browser Autofill & Password Manager Integration', () => {
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

  it('renders standard form semantics and attributes for browser password managers', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const form = document.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('name')).toBe('login')
    expect(form?.getAttribute('id')).toBe('login-form')

    // Email input
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(emailInput.getAttribute('autocomplete')).toBe('username')
    expect(emailInput.getAttribute('name')).toBe('username')
    expect(emailInput.getAttribute('type')).toBe('email')

    // Password input
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    expect(passwordInput.getAttribute('autocomplete')).toBe('current-password')
    expect(passwordInput.getAttribute('name')).toBe('password')
    expect(passwordInput.getAttribute('type')).toBe('password')
  })

  it('reads autofilled DOM values on form submit even if React state was not triggered by synthetic events', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    const submitBtn = screen.getByRole('button', { name: /^sign in$/i })

    // Simulate browser password manager directly mutating DOM input values (autofill)
    emailInput.value = 'autofilled@workpulse.app'
    passwordInput.value = 'SecretAutofillPass123!'

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'autofilled@workpulse.app',
        password: 'SecretAutofillPass123!',
      })
    })
  })

  it('stores saved email in localStorage when Remember Me is enabled and restores it on revisit', async () => {
    // 1. First visit: user signs in with Remember Me checked
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

    fireEvent.change(emailInput, { target: { value: 'remembered_user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(localStorage.getItem('workpulse_saved_email')).toBe('remembered_user@example.com')
      // Passwords MUST NEVER be stored in localStorage
      expect(localStorage.getItem('password')).toBeNull()
      expect(localStorage.getItem('workpulse_saved_password')).toBeNull()
    })
  })

  it('restores previously saved email into the username input on revisiting the login page', () => {
    // Pre-populate saved email from previous login with Remember Me enabled
    localStorage.setItem('workpulse_saved_email', 'remembered_user@example.com')

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AuthPage />
        </MemoryRouter>
      </ThemeProvider>
    )

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(emailInput.value).toBe('remembered_user@example.com')

    // Password must remain empty and left to the browser password manager
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    expect(passwordInput.value).toBe('')
  })

  it('removes saved email from localStorage when Remember Me is unchecked on sign in', async () => {
    localStorage.setItem('workpulse_saved_email', 'old_user@example.com')

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

    fireEvent.change(emailInput, { target: { value: 'session_only@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(localStorage.getItem('workpulse_saved_email')).toBeNull()
    })
  })
})

