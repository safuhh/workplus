import { describe, it, expect } from 'vitest'
import {
  computeWorkdayState,
  elapsedSecondsForEntry,
  sumEntrySeconds,
  formatDuration,
} from '../calculations'
import type { TimeEntry, WorkSession, UserSettings } from '../../../types'

const settings: UserSettings = {
  id: 'user-1',
  timezone: 'UTC',
  work_target_seconds: 28800, // 8 hours
  break_target_seconds: 3600,  // 1 hour
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('Persistent Background Time Tracking', () => {
  it('Scenario 1: Start work → Close browser → Wait 30 minutes → Reopen browser', () => {
    // 1. User starts work at 09:00:00 UTC
    const session: WorkSession = {
      id: 'session-1',
      user_id: 'user-1',
      work_date: '2026-11-09',
      timezone_snapshot: 'UTC',
      status: 'working',
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: null,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T09:00:00.000Z',
    }

    const entries: TimeEntry[] = [
      {
        id: 'entry-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T09:00:00.000Z',
        ended_at: null, // open active interval
        created_at: '2026-11-09T09:00:00.000Z',
      },
    ]

    // 2. User closes browser at 09:05:00 UTC (5 mins). Active timer in Supabase is NOT paused.
    // 3. User reopens browser 30 minutes after start at 09:30:00 UTC
    const reopenNowMs = new Date('2026-11-09T09:30:00.000Z').getTime()

    // 4. Client restores active session from DB and computes elapsed duration
    const state = computeWorkdayState(session, entries, settings, reopenNowMs)

    expect(state.workSeconds).toBe(1800) // Exactly 30 minutes (1800s)
    expect(formatDuration(state.workSeconds)).toBe('00:30:00')
    expect(state.breakSeconds).toBe(0)
    expect(state.remainingWorkSeconds).toBe(28800 - 1800) // 27000s (7h 30m)
    expect(state.isWorkRunning).toBe(true)
  })

  it('Scenario 2: Start break → Close browser → Wait 15 minutes → Reopen browser', () => {
    // 1. User worked 2 hours: 09:00 to 11:00 UTC (7200s), then starts break at 11:00 UTC
    const session: WorkSession = {
      id: 'session-1',
      user_id: 'user-1',
      work_date: '2026-11-09',
      timezone_snapshot: 'UTC',
      status: 'on_break',
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: null,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T11:00:00.000Z',
    }

    const entries: TimeEntry[] = [
      {
        id: 'entry-work-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T09:00:00.000Z',
        ended_at: '2026-11-09T11:00:00.000Z', // 7200 seconds closed work
        created_at: '2026-11-09T09:00:00.000Z',
      },
      {
        id: 'entry-break-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'break',
        started_at: '2026-11-09T11:00:00.000Z',
        ended_at: null, // open active break
        created_at: '2026-11-09T11:00:00.000Z',
      },
    ]

    // 2. User closes browser. Reopens 15 minutes later at 11:15:00 UTC
    const reopenNowMs = new Date('2026-11-09T11:15:00.000Z').getTime()

    const state = computeWorkdayState(session, entries, settings, reopenNowMs)

    expect(state.workSeconds).toBe(7200) // Work time remains 2h (7200s)
    expect(state.breakSeconds).toBe(900) // Break time is 15m (900s)
    expect(formatDuration(state.breakSeconds)).toBe('00:15:00')
    expect(state.remainingBreakSeconds).toBe(3600 - 900) // 2700s allowance remaining
    expect(state.isBreakRunning).toBe(true)
  })

  it('Scenario 3: Start work → Pause → Close browser → Reopen browser → Resume', () => {
    // 1. User worked from 09:00:00 to 09:45:00 (45 mins = 2700s), then clicked Pause
    const pausedSession: WorkSession = {
      id: 'session-1',
      user_id: 'user-1',
      work_date: '2026-11-09',
      timezone_snapshot: 'UTC',
      status: 'paused_work',
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: null,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T09:45:00.000Z',
    }

    const pausedEntries: TimeEntry[] = [
      {
        id: 'entry-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T09:00:00.000Z',
        ended_at: '2026-11-09T09:45:00.000Z', // closed at pause
        created_at: '2026-11-09T09:00:00.000Z',
      },
    ]

    // 2. Browser closes. 45 minutes pass. Browser reopens at 10:30:00 UTC
    const reopenNowMs = new Date('2026-11-09T10:30:00.000Z').getTime()

    // 3. Verify that elapsed time did NOT increase while paused
    const pausedState = computeWorkdayState(pausedSession, pausedEntries, settings, reopenNowMs)
    expect(pausedState.workSeconds).toBe(2700) // Strictly 45 minutes
    expect(pausedState.isWorkPaused).toBe(true)
    expect(pausedState.isWorkRunning).toBe(false)

    // 4. User clicks Resume at 10:30:00 UTC
    const resumedSession: WorkSession = {
      ...pausedSession,
      status: 'working',
      updated_at: '2026-11-09T10:30:00.000Z',
    }

    const resumedEntries: TimeEntry[] = [
      ...pausedEntries,
      {
        id: 'entry-2',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T10:30:00.000Z',
        ended_at: null, // open interval continuing from previous 45 mins
        created_at: '2026-11-09T10:30:00.000Z',
      },
    ]

    // 5. Check duration 15 minutes after resume (at 10:45:00 UTC)
    const laterNowMs = new Date('2026-11-09T10:45:00.000Z').getTime()
    const runningState = computeWorkdayState(resumedSession, resumedEntries, settings, laterNowMs)

    // Accumulated: 2700s (previous) + 900s (current) = 3600s (1h)
    expect(runningState.workSeconds).toBe(3600)
    expect(formatDuration(runningState.workSeconds)).toBe('01:00:00')
    expect(runningState.isWorkRunning).toBe(true)
  })

  it('Scenario 4: Start work → Put computer to sleep → Wake up → Verify elapsed duration', () => {
    // 1. User starts work at 09:00:00 UTC
    const session: WorkSession = {
      id: 'session-1',
      user_id: 'user-1',
      work_date: '2026-11-09',
      timezone_snapshot: 'UTC',
      status: 'working',
      started_at: '2026-11-09T09:00:00.000Z',
      ended_at: null,
      created_at: '2026-11-09T09:00:00.000Z',
      updated_at: '2026-11-09T09:00:00.000Z',
    }

    const entries: TimeEntry[] = [
      {
        id: 'entry-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T09:00:00.000Z',
        ended_at: null,
        created_at: '2026-11-09T09:00:00.000Z',
      },
    ]

    // 2. Computer is put to sleep at 09:15:00 and wakes up at 11:15:00 UTC (2 hours 15 mins later)
    const wakeUpNowMs = new Date('2026-11-09T11:15:00.000Z').getTime()

    // 3. Calculation uses persisted timestamp, independent of JS tick delays during sleep
    const state = computeWorkdayState(session, entries, settings, wakeUpNowMs)

    expect(state.workSeconds).toBe(8100) // 2h 15m = 8100 seconds
    expect(formatDuration(state.workSeconds)).toBe('02:15:00')
    expect(state.isWorkRunning).toBe(true)
  })

  it('Scenario 5: Ensures paused intervals are strictly excluded from totals', () => {
    // Interval 1: 09:00 to 10:00 (3600s work)
    // Paused gap: 10:00 to 11:30 (1h 30m idle, NO entry)
    // Interval 2: 11:30 to 12:30 (3600s work)
    const entries: TimeEntry[] = [
      {
        id: 'entry-1',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T09:00:00.000Z',
        ended_at: '2026-11-09T10:00:00.000Z',
        created_at: '2026-11-09T09:00:00.000Z',
      },
      {
        id: 'entry-2',
        session_id: 'session-1',
        user_id: 'user-1',
        entry_type: 'work',
        started_at: '2026-11-09T11:30:00.000Z',
        ended_at: '2026-11-09T12:30:00.000Z',
        created_at: '2026-11-09T11:30:00.000Z',
      },
    ]

    const workSecs = sumEntrySeconds(entries, 'work', new Date('2026-11-09T13:00:00.000Z').getTime())
    // Exactly 2 hours of work, despite 4 hours of elapsed calendar time
    expect(workSecs).toBe(7200)
    expect(formatDuration(workSecs)).toBe('02:00:00')
  })

  it('Scenario 6: Verifies running entry calculation formula (accumulated + current running duration)', () => {
    const entry1: TimeEntry = {
      id: 'e1',
      session_id: 's1',
      user_id: 'u1',
      entry_type: 'work',
      started_at: '2026-11-09T08:00:00.000Z',
      ended_at: '2026-11-09T10:00:00.000Z', // 7200s accumulated
      created_at: '2026-11-09T08:00:00.000Z',
    }

    const entry2: TimeEntry = {
      id: 'e2',
      session_id: 's1',
      user_id: 'u1',
      entry_type: 'work',
      started_at: '2026-11-09T10:30:00.000Z',
      ended_at: null, // running since 10:30:00
      created_at: '2026-11-09T10:30:00.000Z',
    }

    // At 11:00:00 UTC (30 minutes of running duration)
    const nowMs = new Date('2026-11-09T11:00:00.000Z').getTime()
    const e1Secs = elapsedSecondsForEntry(entry1, nowMs)
    const e2Secs = elapsedSecondsForEntry(entry2, nowMs)

    expect(e1Secs).toBe(7200) // accumulated closed duration
    expect(e2Secs).toBe(1800) // current time - running start timestamp
    expect(e1Secs + e2Secs).toBe(9000) // Total: 2h 30m = 9000s
  })
})

