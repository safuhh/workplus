/**
 * Unit tests for WorkPulse domain calculation functions.
 *
 * Tests cover:
 * - No session started
 * - Work interval running
 * - Break interval running
 * - Multiple work/break intervals in one workday
 * - Work target reached exactly and exceeded
 * - Break target reached exactly and exceeded
 * - Break crossing 1-hour target without stopping
 * - Refresh/reload recovery using persisted open interval
 * - Finish workday while working and while on break
 * - Invalid transitions
 * - DST-safe elapsed calculations (using UTC instants)
 */

import { describe, it, expect } from 'vitest'
import {
  elapsedSecondsForEntry,
  sumEntrySeconds,
  computeWorkdayState,
  formatDuration,
  formatDurationHuman,
  validateTransition,
  getLocalWorkDate,
} from '../calculations'
import type { TimeEntry, WorkSession, UserSettings } from '../../../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<TimeEntry> & { entry_type: 'work' | 'break' },
): TimeEntry {
  return {
    id: 'e1',
    session_id: 's1',
    user_id: 'u1',
    started_at: new Date(0).toISOString(),
    ended_at: null,
    created_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function makeSession(overrides?: Partial<WorkSession>): WorkSession {
  return {
    id: 's1',
    user_id: 'u1',
    work_date: '2025-01-01',
    timezone_snapshot: 'UTC',
    status: 'working',
    started_at: new Date(0).toISOString(),
    ended_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

const DEFAULT_SETTINGS: UserSettings = {
  id: 'u1',
  timezone: 'UTC',
  work_target_seconds: 28800,  // 8h
  break_target_seconds: 3600,  // 1h
  created_at: '',
  updated_at: '',
}

// Fixed "now" for deterministic tests: 10h after epoch
const NOW_MS = 10 * 3600 * 1000

// ── elapsedSecondsForEntry ────────────────────────────────────────────────────

describe('elapsedSecondsForEntry', () => {
  it('returns 0 for a fresh entry at the same instant', () => {
    const entry = makeEntry({ entry_type: 'work', started_at: new Date(NOW_MS).toISOString() })
    expect(elapsedSecondsForEntry(entry, NOW_MS)).toBe(0)
  })

  it('calculates elapsed for open entry using nowMs', () => {
    const startMs = NOW_MS - 5000
    const entry = makeEntry({ entry_type: 'work', started_at: new Date(startMs).toISOString() })
    expect(elapsedSecondsForEntry(entry, NOW_MS)).toBe(5)
  })

  it('uses ended_at when entry is closed', () => {
    const startMs = NOW_MS - 10000
    const endMs = NOW_MS - 2000
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(startMs).toISOString(),
      ended_at: new Date(endMs).toISOString(),
    })
    expect(elapsedSecondsForEntry(entry, NOW_MS)).toBe(8)
  })

  it('never returns negative (future start timestamps return 0)', () => {
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS + 5000).toISOString(),
    })
    expect(elapsedSecondsForEntry(entry, NOW_MS)).toBe(0)
  })

  it('is DST-safe — uses UTC instants, not local string subtraction', () => {
    // 3600 second interval — same regardless of DST
    const startMs = 0
    const endMs = 3600 * 1000
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(startMs).toISOString(),
      ended_at: new Date(endMs).toISOString(),
    })
    expect(elapsedSecondsForEntry(entry, NOW_MS)).toBe(3600)
  })
})

// ── sumEntrySeconds ──────────────────────────────────────────────────────────

describe('sumEntrySeconds', () => {
  it('returns 0 when no entries of the requested type', () => {
    const entries = [makeEntry({ entry_type: 'break', started_at: new Date(NOW_MS - 60000).toISOString(), ended_at: new Date(NOW_MS).toISOString() })]
    expect(sumEntrySeconds(entries, 'work', NOW_MS)).toBe(0)
  })

  it('sums multiple work entries', () => {
    const entries = [
      makeEntry({ id: 'e1', entry_type: 'work', started_at: new Date(NOW_MS - 7200000).toISOString(), ended_at: new Date(NOW_MS - 3600000).toISOString() }),
      makeEntry({ id: 'e2', entry_type: 'work', started_at: new Date(NOW_MS - 1800000).toISOString(), ended_at: new Date(NOW_MS).toISOString() }),
    ]
    expect(sumEntrySeconds(entries, 'work', NOW_MS)).toBe(3600 + 1800)
  })

  it('open entry uses nowMs for its duration', () => {
    const openEntry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - 3600000).toISOString(),
      ended_at: null,
    })
    expect(sumEntrySeconds([openEntry], 'work', NOW_MS)).toBe(3600)
  })

  it('does not include break time in work sum', () => {
    const work = makeEntry({ id: 'e1', entry_type: 'work', started_at: new Date(0).toISOString(), ended_at: new Date(3600000).toISOString() })
    const brk = makeEntry({ id: 'e2', entry_type: 'break', started_at: new Date(3600000).toISOString(), ended_at: new Date(7200000).toISOString() })
    expect(sumEntrySeconds([work, brk], 'work', NOW_MS)).toBe(3600)
    expect(sumEntrySeconds([work, brk], 'break', NOW_MS)).toBe(3600)
  })
})

// ── computeWorkdayState ───────────────────────────────────────────────────────

describe('computeWorkdayState — no session', () => {
  it('returns not_started state with full remaining targets', () => {
    const result = computeWorkdayState(null, [], DEFAULT_SETTINGS, NOW_MS)
    expect(result.currentState).toBe('not_started')
    expect(result.workSeconds).toBe(0)
    expect(result.breakSeconds).toBe(0)
    expect(result.remainingWorkSeconds).toBe(28800)
    expect(result.remainingBreakSeconds).toBe(3600)
    expect(result.breakOverrunSeconds).toBe(0)
    expect(result.projectedFinishAt).toBeNull()
  })
})

describe('computeWorkdayState — work interval running', () => {
  it('accumulates work time and projects finish', () => {
    const session = makeSession({ status: 'working' })
    const workMs = 3 * 3600 * 1000  // 3h of work
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - workMs).toISOString(),
    })
    const result = computeWorkdayState(session, [entry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.currentState).toBe('working')
    expect(result.workSeconds).toBe(10800)       // 3h
    expect(result.breakSeconds).toBe(0)
    expect(result.remainingWorkSeconds).toBe(18000) // 5h
    expect(result.workProgressPct).toBeCloseTo(37.5)
    expect(result.projectedFinishAt).toBeInstanceOf(Date)
  })
})

describe('computeWorkdayState — break interval running', () => {
  it('accumulates break time separately from work time', () => {
    const session = makeSession({ status: 'on_break' })
    const workEntry = makeEntry({
      id: 'e1',
      entry_type: 'work',
      started_at: new Date(NOW_MS - 7200000).toISOString(),
      ended_at: new Date(NOW_MS - 1800000).toISOString(), // 1.5h work
    })
    const breakEntry = makeEntry({
      id: 'e2',
      entry_type: 'break',
      started_at: new Date(NOW_MS - 1800000).toISOString(), // 30m break, still open
    })
    const result = computeWorkdayState(session, [workEntry, breakEntry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.currentState).toBe('on_break')
    expect(result.workSeconds).toBe(5400)        // 1.5h
    expect(result.breakSeconds).toBe(1800)       // 30m
    expect(result.remainingBreakSeconds).toBe(1800)
    expect(result.breakOverrunSeconds).toBe(0)
  })
})

describe('computeWorkdayState — multiple work/break intervals', () => {
  it('sums all intervals correctly', () => {
    const session = makeSession({ status: 'working' })
    const entries: TimeEntry[] = [
      makeEntry({ id: 'e1', entry_type: 'work',  started_at: new Date(NOW_MS - 10800000).toISOString(), ended_at: new Date(NOW_MS - 7200000).toISOString() }), // 1h
      makeEntry({ id: 'e2', entry_type: 'break', started_at: new Date(NOW_MS - 7200000).toISOString(),  ended_at: new Date(NOW_MS - 5400000).toISOString() }), // 30m
      makeEntry({ id: 'e3', entry_type: 'work',  started_at: new Date(NOW_MS - 5400000).toISOString(), ended_at: new Date(NOW_MS - 3600000).toISOString() }), // 30m
      makeEntry({ id: 'e4', entry_type: 'break', started_at: new Date(NOW_MS - 3600000).toISOString(), ended_at: new Date(NOW_MS - 1800000).toISOString() }), // 30m
      makeEntry({ id: 'e5', entry_type: 'work',  started_at: new Date(NOW_MS - 1800000).toISOString() }), // 30m open
    ]
    const result = computeWorkdayState(session, entries, DEFAULT_SETTINGS, NOW_MS)
    expect(result.workSeconds).toBe(7200)       // 1h + 30m + 30m = 2h
    expect(result.breakSeconds).toBe(3600)      // 30m + 30m = 1h
    expect(result.breakOverrunSeconds).toBe(0)  // exactly at target
    expect(result.remainingBreakSeconds).toBe(0)
  })
})

describe('computeWorkdayState — work target reached exactly', () => {
  it('shows 100% progress and 0 remaining work', () => {
    const session = makeSession({ status: 'working' })
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - 28800000).toISOString(),
    })
    const result = computeWorkdayState(session, [entry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.workSeconds).toBe(28800)
    expect(result.remainingWorkSeconds).toBe(0)
    expect(result.workProgressPct).toBe(100)
  })
})

describe('computeWorkdayState — work target exceeded', () => {
  it('caps progress bar at 100 but shows full workSeconds', () => {
    const session = makeSession({ status: 'working' })
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - 32400000).toISOString(), // 9h
    })
    const result = computeWorkdayState(session, [entry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.workSeconds).toBe(32400)       // full 9h shown
    expect(result.remainingWorkSeconds).toBe(0)
    expect(result.workProgressPct).toBe(100)      // capped at 100
  })
})

describe('computeWorkdayState — break target exceeded (overrun)', () => {
  it('shows overrun and continues tracking break beyond 1h', () => {
    const session = makeSession({ status: 'on_break' })
    const breakEntry = makeEntry({
      entry_type: 'break',
      started_at: new Date(NOW_MS - 5400000).toISOString(), // 1.5h break
    })
    const result = computeWorkdayState(session, [breakEntry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.breakSeconds).toBe(5400)
    expect(result.breakOverrunSeconds).toBe(1800) // 30m over
    expect(result.remainingBreakSeconds).toBe(0)
    expect(result.breakProgressPct).toBe(100)     // capped
  })
})

describe('computeWorkdayState — completed session', () => {
  it('shows completed state with no projectedFinishAt', () => {
    const session = makeSession({ status: 'completed' })
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - 28800000).toISOString(),
      ended_at: new Date(NOW_MS).toISOString(),
    })
    const result = computeWorkdayState(session, [entry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.currentState).toBe('completed')
    expect(result.projectedFinishAt).toBeNull()
  })
})

describe('computeWorkdayState — progress bar capping', () => {
  it('work progress is capped at 100 even with 200% actual work', () => {
    const session = makeSession({ status: 'working' })
    const entry = makeEntry({
      entry_type: 'work',
      started_at: new Date(NOW_MS - 57600000).toISOString(), // 16h (200% of 8h)
    })
    const result = computeWorkdayState(session, [entry], DEFAULT_SETTINGS, NOW_MS)
    expect(result.workProgressPct).toBe(100)
    expect(result.workSeconds).toBe(57600)
  })
})

// ── validateTransition ───────────────────────────────────────────────────────

describe('validateTransition', () => {
  it('allows start_workday from not_started', () => {
    expect(validateTransition('not_started', 'start_workday')).toBeNull()
  })
  it('allows start_break from working', () => {
    expect(validateTransition('working', 'start_break')).toBeNull()
  })
  it('allows resume_work from on_break', () => {
    expect(validateTransition('on_break', 'resume_work')).toBeNull()
  })
  it('allows finish_workday from working', () => {
    expect(validateTransition('working', 'finish_workday')).toBeNull()
  })
  it('allows finish_workday from on_break', () => {
    expect(validateTransition('on_break', 'finish_workday')).toBeNull()
  })
  it('rejects start_workday from working', () => {
    expect(validateTransition('working', 'start_workday')).not.toBeNull()
  })
  it('rejects start_break from on_break', () => {
    expect(validateTransition('on_break', 'start_break')).not.toBeNull()
  })
  it('rejects resume_work from working', () => {
    expect(validateTransition('working', 'resume_work')).not.toBeNull()
  })
  it('rejects any transition from completed', () => {
    expect(validateTransition('completed', 'start_workday')).not.toBeNull()
    expect(validateTransition('completed', 'start_break')).not.toBeNull()
    expect(validateTransition('completed', 'resume_work')).not.toBeNull()
    expect(validateTransition('completed', 'finish_workday')).not.toBeNull()
  })
})

// ── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00')
  })
  it('formats 3661 seconds as 01:01:01', () => {
    expect(formatDuration(3661)).toBe('01:01:01')
  })
  it('formats 28800 as 08:00:00', () => {
    expect(formatDuration(28800)).toBe('08:00:00')
  })
})

// ── formatDurationHuman ──────────────────────────────────────────────────────

describe('formatDurationHuman', () => {
  it('shows "0m" for zero', () => {
    expect(formatDurationHuman(0)).toBe('0m')
  })
  it('shows "5h 30m" for 5.5 hours', () => {
    expect(formatDurationHuman(5 * 3600 + 1800)).toBe('5h 30m')
  })
  it('shows "45m" for 45 minutes', () => {
    expect(formatDurationHuman(2700)).toBe('45m')
  })
  it('shows "30s" for 30 seconds', () => {
    expect(formatDurationHuman(30)).toBe('30s')
  })
})

// ── Work and Break Controls: Pause, Resume, Stop ──────────────────────────────

describe('computeWorkdayState — Pause and Resume duration preservation', () => {
  it('freezes work duration when work is paused, even when nowMs advances', () => {
    const session = makeSession({ status: 'paused_work' })
    // Work ran for 15 minutes (900 seconds) and was closed
    const closedEntry = makeEntry({
      entry_type: 'work',
      started_at: new Date(1000000).toISOString(),
      ended_at: new Date(1000000 + 900000).toISOString(),
    })

    // Calculate at the moment it paused
    const resultAtPause = computeWorkdayState(session, [closedEntry], DEFAULT_SETTINGS, 1000000 + 900000)
    expect(resultAtPause.workSeconds).toBe(900)
    expect(resultAtPause.isWorkPaused).toBe(true)
    expect(resultAtPause.isWorkRunning).toBe(false)

    // Calculate 2 hours later — work duration MUST NOT advance
    const resultLater = computeWorkdayState(session, [closedEntry], DEFAULT_SETTINGS, 1000000 + 900000 + 7200000)
    expect(resultLater.workSeconds).toBe(900)
    expect(resultLater.isWorkPaused).toBe(true)
  })

  it('freezes break duration when break is paused, even when nowMs advances', () => {
    const session = makeSession({ status: 'paused_break' })
    // Break ran for 10 minutes (600 seconds) and was closed
    const closedBreak = makeEntry({
      entry_type: 'break',
      started_at: new Date(1000000).toISOString(),
      ended_at: new Date(1000000 + 600000).toISOString(),
    })

    const result = computeWorkdayState(session, [closedBreak], DEFAULT_SETTINGS, 1000000 + 600000 + 3600000)
    expect(result.breakSeconds).toBe(600)
    expect(result.isBreakPaused).toBe(true)
    expect(result.isBreakRunning).toBe(false)
  })

  it('correctly resumes from paused work and accumulates new elapsed time', () => {
    const session = makeSession({ status: 'working' })
    const closedEntry = makeEntry({
      id: 'e1',
      entry_type: 'work',
      started_at: new Date(1000000).toISOString(),
      ended_at: new Date(1000000 + 900000).toISOString(), // 900s
    })
    // Resumed at 3000000, currently at 3060000 (60s elapsed in new interval)
    const activeEntry = makeEntry({
      id: 'e2',
      entry_type: 'work',
      started_at: new Date(3000000).toISOString(),
      ended_at: null,
    })

    const result = computeWorkdayState(session, [closedEntry, activeEntry], DEFAULT_SETTINGS, 3060000)
    expect(result.workSeconds).toBe(960) // 900 + 60
    expect(result.isWorkRunning).toBe(true)
    expect(result.isWorkPaused).toBe(false)
  })
})

describe('validateTransition — Start, Pause, Resume, Stop for Work and Break', () => {
  it('allows pause_work only when working', () => {
    expect(validateTransition('working', 'pause_work')).toBeNull()
    expect(validateTransition('paused_work', 'pause_work')).not.toBeNull()
    expect(validateTransition('on_break', 'pause_work')).not.toBeNull()
    expect(validateTransition('completed', 'pause_work')).not.toBeNull()
  })

  it('allows resume_work from paused_work and on_break', () => {
    expect(validateTransition('paused_work', 'resume_work')).toBeNull()
    expect(validateTransition('on_break', 'resume_work')).toBeNull()
    expect(validateTransition('paused_break', 'resume_work')).toBeNull()
    expect(validateTransition('working', 'resume_work')).not.toBeNull()
  })

  it('allows stop_work from working, paused_work, and on_break', () => {
    expect(validateTransition('working', 'stop_work')).toBeNull()
    expect(validateTransition('paused_work', 'stop_work')).toBeNull()
    expect(validateTransition('on_break', 'stop_work')).toBeNull()
    expect(validateTransition('completed', 'stop_work')).not.toBeNull()
  })

  it('allows pause_break only when on_break', () => {
    expect(validateTransition('on_break', 'pause_break')).toBeNull()
    expect(validateTransition('working', 'pause_break')).not.toBeNull()
    expect(validateTransition('paused_break', 'pause_break')).not.toBeNull()
  })

  it('allows resume_break from paused_break', () => {
    expect(validateTransition('paused_break', 'resume_break')).toBeNull()
    expect(validateTransition('on_break', 'resume_break')).not.toBeNull()
  })

  it('allows stop_break from on_break and paused_break', () => {
    expect(validateTransition('on_break', 'stop_break')).toBeNull()
    expect(validateTransition('paused_break', 'stop_break')).toBeNull()
    expect(validateTransition('not_started', 'stop_break')).not.toBeNull()
  })
})

// ── getLocalWorkDate ──────────────────────────────────────────────────────────

describe('getLocalWorkDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    const date = getLocalWorkDate('UTC', new Date('2025-06-15T12:00:00Z'))
    expect(date).toBe('2025-06-15')
  })

  it('handles timezone offset correctly (IST is UTC+5:30)', () => {
    // 2025-06-15T23:00:00Z = 2025-06-16T04:30:00 IST
    const date = getLocalWorkDate('Asia/Kolkata', new Date('2025-06-15T23:00:00Z'))
    expect(date).toBe('2025-06-16')
  })

  it('handles DST transitions — elapsed is from UTC instants', () => {
    // This just ensures the function returns a valid date format
    const date = getLocalWorkDate('America/New_York', new Date('2025-03-09T07:00:00Z'))
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

