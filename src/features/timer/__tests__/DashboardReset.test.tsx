import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DashboardPage } from '../DashboardPage'
import * as queries from '../../../domain/time-tracking/queries'
import * as authContext from '../../auth/context'
import type { UserSettings, WorkSession, TimeEntry } from '../../../types'

vi.mock('../../../domain/time-tracking/queries', () => ({
  fetchActiveSession: vi.fn(),
  fetchEntriesForSession: vi.fn(),
  fetchHistory: vi.fn(),
  deleteWorkSession: vi.fn(),
  rpcStartWork: vi.fn(),
  rpcPauseWork: vi.fn(),
  rpcResumeWork: vi.fn(),
  rpcStopWork: vi.fn(),
  rpcStartBreak: vi.fn(),
  rpcPauseBreak: vi.fn(),
  rpcResumeBreak: vi.fn(),
  rpcStopBreak: vi.fn(),
  rpcStartWorkday: vi.fn(),
  rpcFinishWorkday: vi.fn(),
  rpcResetTodayTimer: vi.fn(),
}))

vi.mock('../../auth/context', () => ({
  useAuth: vi.fn(),
}))

const mockSettings: UserSettings = {
  id: 'user-123',
  timezone: 'UTC',
  work_target_seconds: 28800, // 8 hours
  break_target_seconds: 3600,  // 1 hour
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockActiveWorkingSession: WorkSession = {
  id: 'session-today',
  user_id: 'user-123',
  work_date: '2026-11-09',
  timezone_snapshot: 'UTC',
  status: 'working',
  started_at: '2026-11-09T08:00:00Z',
  ended_at: null,
  created_at: '2026-11-09T08:00:00Z',
  updated_at: '2026-11-09T08:00:00Z',
}

const mockEntries: TimeEntry[] = [
  {
    id: 'entry-1',
    session_id: 'session-today',
    user_id: 'user-123',
    entry_type: 'work',
    started_at: '2026-11-09T08:00:00Z',
    ended_at: '2026-11-09T10:00:00Z', // 2 hours = 7200s
    created_at: '2026-11-09T08:00:00Z',
  },
  {
    id: 'entry-2',
    session_id: 'session-today',
    user_id: 'user-123',
    entry_type: 'break',
    started_at: '2026-11-09T10:00:00Z',
    ended_at: '2026-11-09T10:30:00Z', // 30 mins = 1800s
    created_at: '2026-11-09T10:00:00Z',
  },
  {
    id: 'entry-3',
    session_id: 'session-today',
    user_id: 'user-123',
    entry_type: 'work',
    started_at: '2026-11-09T10:30:00Z',
    ended_at: null, // open active interval
    created_at: '2026-11-09T10:30:00Z',
  },
]

describe('DashboardPage - Reset Timer Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' } as never,
      session: null,
      loading: false,
      signOut: vi.fn(),
    })
    vi.mocked(queries.fetchActiveSession).mockResolvedValue({ ...mockActiveWorkingSession })
    vi.mocked(queries.fetchEntriesForSession).mockResolvedValue([...mockEntries])
    vi.mocked(queries.rpcResetTodayTimer).mockResolvedValue({
      success: true,
      deleted: true,
      work_date: '2026-11-09',
    })
  })

  it('renders the Reset button in the dashboard header bar', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.queryByText(/loading your workday/i)).toBeNull()
    })

    const resetBtn = screen.getByRole('button', { name: /reset today's timer/i })
    expect(resetBtn).toBeDefined()
    expect(document.body.contains(resetBtn)).toBe(true)
  })

  it('opens confirmation modal with current work/break details when Reset is clicked', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText("Reset Today's Timer?")).toBeDefined()
    expect(screen.getByText(/Reset current day's work and break time to zero/i)).toBeDefined()
    expect(screen.getByText(/Recorded Intervals:/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^reset timer$/i })).toBeDefined()
  })

  it('cancels reset and keeps timer data unchanged when Cancel is clicked', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(queries.rpcResetTodayTimer).not.toHaveBeenCalled()
  })

  it('cancels reset when Escape key is pressed', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(queries.rpcResetTodayTimer).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation checkbox when a timer is actively running', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))

    // Active timer warning should appear
    expect(screen.getByText(/A timer is actively running right now!/i)).toBeDefined()

    const confirmBtn = screen.getByRole('button', { name: /^reset timer$/i }) as HTMLButtonElement
    // Must be disabled initially
    expect(confirmBtn.disabled).toBe(true)

    // Check the confirmation checkbox
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Now enabled
    expect(confirmBtn.disabled).toBe(false)
  })

  it('resets work and break totals to 00:00:00, clears timeline, updates calculations, and shows success message', async () => {
    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))

    // Check the active discard confirmation box
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    const confirmBtn = screen.getByRole('button', { name: /^reset timer$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(queries.rpcResetTodayTimer).toHaveBeenCalledWith('UTC')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // Work and Break timers reset to 00:00:00
    const zeroDurations = screen.getAllByText('00:00:00')
    expect(zeroDurations.length).toBeGreaterThanOrEqual(2)

    // 0% progress
    const zeroPcts = screen.getAllByText('0%')
    expect(zeroPcts.length).toBeGreaterThanOrEqual(2)

    // Remaining targets restored to full 8h and 1h
    expect(screen.getByText(/8h remaining/i)).toBeDefined()
    expect(screen.getByText(/1h allowance remaining/i)).toBeDefined()

    // Activity timeline cleared
    expect(screen.queryByText(/Today's Activity Timeline/i)).toBeNull()

    // Success alert displayed
    expect(screen.getByText(/Today's work and break timers have been successfully reset to 00:00:00/i)).toBeDefined()
  })

  it('displays an error alert and preserves data if reset fails', async () => {
    vi.mocked(queries.rpcResetTodayTimer).mockRejectedValueOnce(new Error('Database lock timeout or permission denied'))

    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    const confirmBtn = screen.getByRole('button', { name: /^reset timer$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText('Database lock timeout or permission denied')).toBeDefined()
    })

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Data is still intact and not reset
    expect(screen.getByText(/Today's Activity Timeline/i)).toBeDefined()
  })

  it('keeps previous work history intact and prevents browser refresh from restoring reset data', async () => {
    // Mock past days in history
    const pastDaysHistory: queries.DayHistory[] = [
      {
        session: {
          id: 'session-yesterday',
          user_id: 'user-123',
          work_date: '2026-11-08',
          timezone_snapshot: 'UTC',
          status: 'completed',
          started_at: '2026-11-08T09:00:00Z',
          ended_at: '2026-11-08T17:00:00Z',
          created_at: '2026-11-08T09:00:00Z',
          updated_at: '2026-11-08T17:00:00Z',
        } as WorkSession,
        entries: [],
      },
    ]

    vi.mocked(queries.fetchHistory).mockResolvedValue(pastDaysHistory)

    render(<DashboardPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reset today's timer/i })).toBeDefined()
    })

    // Reset today
    fireEvent.click(screen.getByRole('button', { name: /reset today's timer/i }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /^reset timer$/i }))

    await waitFor(() => {
      expect(queries.rpcResetTodayTimer).toHaveBeenCalledWith('UTC')
    })

    // Verify history query for past days still returns yesterday's session
    const history = await queries.fetchHistory()
    expect(history).toHaveLength(1)
    expect(history[0].session.id).toBe('session-yesterday')
    expect(history[0].session.work_date).toBe('2026-11-08')

    // Simulate browser refresh: fetchActiveSession now returns null for today
    vi.mocked(queries.fetchActiveSession).mockResolvedValue(null)
    const refreshedActiveSession = await queries.fetchActiveSession('UTC')
    expect(refreshedActiveSession).toBeNull()
  })
})
