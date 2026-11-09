import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HistoryPage } from '../HistoryPage'
import * as queries from '../../../domain/time-tracking/queries'
import type { UserSettings, WorkSession, TimeEntry } from '../../../types'

vi.mock('../../../domain/time-tracking/queries', () => ({
  fetchHistory: vi.fn(),
  deleteWorkSession: vi.fn(),
}))

const mockSettings: UserSettings = {
  id: 'user-123',
  timezone: 'UTC',
  work_target_seconds: 28800,
  break_target_seconds: 3600,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockSessions: queries.DayHistory[] = [
  {
    session: {
      id: 'session-1',
      user_id: 'user-123',
      work_date: '2026-11-08',
      timezone_snapshot: 'UTC',
      status: 'completed',
      started_at: '2026-11-08T09:00:00Z',
      ended_at: '2026-11-08T17:00:00Z',
      created_at: '2026-11-08T09:00:00Z',
      updated_at: '2026-11-08T17:00:00Z',
    } as WorkSession,
    entries: [
      {
        id: 'entry-1',
        session_id: 'session-1',
        user_id: 'user-123',
        entry_type: 'work',
        started_at: '2026-11-08T09:00:00Z',
        ended_at: '2026-11-08T13:00:00Z',
        created_at: '2026-11-08T09:00:00Z',
      } as TimeEntry,
      {
        id: 'entry-2',
        session_id: 'session-1',
        user_id: 'user-123',
        entry_type: 'break',
        started_at: '2026-11-08T13:00:00Z',
        ended_at: '2026-11-08T14:00:00Z',
        created_at: '2026-11-08T13:00:00Z',
      } as TimeEntry,
      {
        id: 'entry-3',
        session_id: 'session-1',
        user_id: 'user-123',
        entry_type: 'work',
        started_at: '2026-11-08T14:00:00Z',
        ended_at: '2026-11-08T18:00:00Z',
        created_at: '2026-11-08T14:00:00Z',
      } as TimeEntry,
    ],
  },
  {
    session: {
      id: 'session-2',
      user_id: 'user-123',
      work_date: '2026-11-07',
      timezone_snapshot: 'UTC',
      status: 'completed',
      started_at: '2026-11-07T09:00:00Z',
      ended_at: '2026-11-07T17:00:00Z',
      created_at: '2026-11-07T09:00:00Z',
      updated_at: '2026-11-07T17:00:00Z',
    } as WorkSession,
    entries: [
      {
        id: 'entry-4',
        session_id: 'session-2',
        user_id: 'user-123',
        entry_type: 'work',
        started_at: '2026-11-07T09:00:00Z',
        ended_at: '2026-11-07T17:00:00Z',
        created_at: '2026-11-07T09:00:00Z',
      } as TimeEntry,
    ],
  },
]

describe('HistoryPage - Delete History Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(queries.fetchHistory).mockResolvedValue([...mockSessions])
    vi.mocked(queries.deleteWorkSession).mockResolvedValue(undefined)
  })

  it('renders history records with delete buttons', async () => {
    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.queryByText(/loading history/i)).toBeNull()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /delete record for/i })
    expect(deleteButtons.length).toBe(2)
  })

  it('opens confirmation dialog with session details when delete button is clicked', async () => {
    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete record for/i })).toHaveLength(2)
    })

    const deleteButtons = screen.getAllByRole('button', { name: /delete record for/i })
    fireEvent.click(deleteButtons[0]) // Click delete on session-1

    expect(screen.getByRole('dialog')).toBeDefined()
    expect(screen.getByText('Delete Work Record?')).toBeDefined()
    expect(screen.getByText(/All 3 recorded intervals for this day will be permanently removed/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^delete record$/i })).toBeDefined()
  })

  it('cancels deletion when Cancel button is clicked', async () => {
    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^delete record for/i })).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^delete record for/i })[0])
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(queries.deleteWorkSession).not.toHaveBeenCalled()
  })

  it('cancels deletion when Escape key is pressed', async () => {
    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^delete record for/i })).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^delete record for/i })[0])
    expect(screen.getByRole('dialog')).toBeDefined()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(queries.deleteWorkSession).not.toHaveBeenCalled()
  })

  it('deletes the selected session, updates the UI immediately, and displays a success alert', async () => {
    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^delete record for/i })).toHaveLength(2)
    })

    // Click delete on the first record (session-1)
    fireEvent.click(screen.getAllByRole('button', { name: /^delete record for/i })[0])

    // Confirm delete
    const confirmBtn = screen.getByRole('button', { name: /^delete record$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(queries.deleteWorkSession).toHaveBeenCalledWith('session-1')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    // Immediate state update: only session-2 remains
    const remainingButtons = screen.getAllByRole('button', { name: /^delete record for/i })
    expect(remainingButtons.length).toBe(1)

    // Success message displayed
    expect(screen.getByText(/was permanently deleted/i)).toBeDefined()
  })

  it('displays an error alert and keeps the record if deletion fails', async () => {
    vi.mocked(queries.deleteWorkSession).mockRejectedValueOnce(new Error('Network error or RLS policy violation'))

    render(<HistoryPage settings={mockSettings} />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^delete record for/i })).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^delete record for/i })[0])

    const confirmBtn = screen.getByRole('button', { name: /^delete record$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.getByText('Network error or RLS policy violation')).toBeDefined()
    })

    // Cancel modal
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Both records still present
    const deleteButtons = screen.getAllByRole('button', { name: /^delete record for/i })
    expect(deleteButtons.length).toBe(2)
  })
})
