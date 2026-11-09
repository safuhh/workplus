import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider } from '../ThemeProvider'
import { ThemeToggle } from '../ThemeToggle'
import { useTheme } from '../context'

function TestConsumer() {
  const { theme, isDark, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="is-dark">{isDark ? 'true' : 'false'}</span>
      <button onClick={toggleTheme} data-testid="toggle-btn">Toggle</button>
    </div>
  )
}

describe('Theme Management', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    vi.restoreAllMocks()

    // Default matchMedia mock (prefers light)
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
  })

  it('defaults to light mode when no localStorage is set and OS prefers light', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme').textContent).toBe('light')
    expect(screen.getByTestId('is-dark').textContent).toBe('false')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('respects OS prefers-color-scheme: dark on first visit', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme').textContent).toBe('dark')
    expect(screen.getByTestId('is-dark').textContent).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('reads stored preference from localStorage', () => {
    localStorage.setItem('workpulse_theme', 'dark')

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles theme between light and dark, persists to localStorage, and updates documentElement class', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    const toggleBtn = screen.getByTestId('toggle-btn')

    // Initial state: light
    expect(screen.getByTestId('current-theme').textContent).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Toggle to dark
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('current-theme').textContent).toBe('dark')
    expect(screen.getByTestId('is-dark').textContent).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('workpulse_theme')).toBe('dark')

    // Toggle back to light
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('current-theme').textContent).toBe('light')
    expect(screen.getByTestId('is-dark').textContent).toBe('false')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('workpulse_theme')).toBe('light')
  })

  it('ThemeToggle component renders proper accessible labels and toggles on click', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )

    const btn = screen.getByRole('button', { name: /switch to dark mode/i })
    expect(btn).toBeDefined()
    expect(document.body.contains(btn)).toBe(true)

    fireEvent.click(btn)

    const lightBtn = screen.getByRole('button', { name: /switch to light mode/i })
    expect(lightBtn).toBeDefined()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
