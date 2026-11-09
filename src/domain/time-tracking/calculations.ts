/**
 * Pure time-tracking calculation functions.
 * These are the single source of truth for all duration math.
 * No side effects, no Supabase calls, fully testable.
 */

import type { TimeEntry, WorkSession, WorkdayComputed, UserSettings, WorkdayStatus } from '../../types'

/**
 * Calculate elapsed seconds for a single time entry.
 * Uses the persisted started_at timestamp as the reference — never a JS counter.
 * @param entry - The time entry
 * @param nowMs - Current time in milliseconds (default: Date.now())
 */
export function elapsedSecondsForEntry(
  entry: TimeEntry,
  nowMs: number = Date.now(),
): number {
  const startMs = new Date(entry.started_at).getTime()
  if (entry.ended_at !== null) {
    const endMs = new Date(entry.ended_at).getTime()
    return Math.max(0, Math.floor((endMs - startMs) / 1000))
  }
  return Math.max(0, Math.floor((nowMs - startMs) / 1000))
}

/**
 * Sum the duration of all time entries of a given type.
 */
export function sumEntrySeconds(
  entries: TimeEntry[],
  type: 'work' | 'break',
  nowMs: number = Date.now(),
): number {
  return entries
    .filter((e) => e.entry_type === type)
    .reduce((acc, e) => acc + elapsedSecondsForEntry(e, nowMs), 0)
}

/**
 * Compute all derived display values from the session, entries, settings, and current time.
 * This is the central calculation — called every second from the UI tick.
 */
export function computeWorkdayState(
  session: WorkSession | null,
  entries: TimeEntry[],
  settings: UserSettings,
  nowMs: number = Date.now(),
): WorkdayComputed {
  if (session === null) {
    return {
      workSeconds: 0,
      breakSeconds: 0,
      remainingWorkSeconds: settings.work_target_seconds,
      remainingBreakSeconds: settings.break_target_seconds,
      breakOverrunSeconds: 0,
      workProgressPct: 0,
      breakProgressPct: 0,
      projectedFinishAt: null,
      currentState: 'not_started',
      isWorkRunning: false,
      isWorkPaused: false,
      isBreakRunning: false,
      isBreakPaused: false,
    }
  }

  const workSeconds = sumEntrySeconds(entries, 'work', nowMs)
  const breakSeconds = sumEntrySeconds(entries, 'break', nowMs)

  const { work_target_seconds, break_target_seconds } = settings

  const remainingWorkSeconds = Math.max(0, work_target_seconds - workSeconds)
  const remainingBreakSeconds = Math.max(0, break_target_seconds - breakSeconds)
  const breakOverrunSeconds = Math.max(0, breakSeconds - break_target_seconds)

  const workProgressPct = Math.min(100, (workSeconds / work_target_seconds) * 100)
  const breakProgressPct = Math.min(100, (breakSeconds / break_target_seconds) * 100)

  // Projected finish: now + remaining work + remaining break allowance
  let projectedFinishAt: Date | null = null
  if (session.status !== 'completed') {
    const finishMs = nowMs + (remainingWorkSeconds + remainingBreakSeconds) * 1000
    projectedFinishAt = new Date(finishMs)
  }

  const isWorkRunning = session.status === 'working'
  const isWorkPaused = session.status === 'paused_work' || session.status === 'paused'
  const isBreakRunning = session.status === 'on_break'
  const isBreakPaused = session.status === 'paused_break'

  return {
    workSeconds,
    breakSeconds,
    remainingWorkSeconds,
    remainingBreakSeconds,
    breakOverrunSeconds,
    workProgressPct,
    breakProgressPct,
    projectedFinishAt,
    currentState: session.status,
    isWorkRunning,
    isWorkPaused,
    isBreakRunning,
    isBreakPaused,
  }
}

/**
 * Format a duration in seconds as HH:MM:SS.
 */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

/**
 * Format a duration in seconds as a human-friendly string: "5h 30m" or "45m 10s".
 */
export function formatDurationHuman(totalSeconds: number): string {
  if (totalSeconds === 0) return '0m'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

/**
 * Format a time in a given timezone, e.g. "10:35 AM"
 */
export function formatTime(date: Date, timezone: string): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Format a date in a given timezone, e.g. "Mon, Nov 9"
 */
export function formatDate(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-IN', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Get the local work date (YYYY-MM-DD) for a given timezone.
 * Uses Intl.DateTimeFormat to avoid string manipulation.
 */
export function getLocalWorkDate(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return parts
}

export type TransitionAction =
  | 'start_workday'
  | 'start_work'
  | 'pause_work'
  | 'resume_work'
  | 'stop_work'
  | 'start_break'
  | 'pause_break'
  | 'resume_break'
  | 'stop_break'
  | 'finish_workday'

/**
 * Validate a state transition.
 * Returns null if valid, or an error message if invalid.
 */
export function validateTransition(
  currentStatus: 'not_started' | WorkdayStatus,
  action: TransitionAction,
): string | null {
  const allowed: Record<TransitionAction, ('not_started' | WorkdayStatus)[]> = {
    start_workday: ['not_started'],
    start_work: ['not_started', 'paused_work', 'paused_break', 'paused', 'on_break'],
    pause_work: ['working'],
    resume_work: ['on_break', 'paused_work', 'paused_break', 'paused'],
    stop_work: ['working', 'paused_work', 'on_break', 'paused_break', 'paused'],
    start_break: ['working', 'not_started', 'paused_work', 'paused_break', 'paused'],
    pause_break: ['on_break'],
    resume_break: ['paused_break', 'working', 'paused_work', 'paused'],
    stop_break: ['on_break', 'paused_break'],
    finish_workday: ['working', 'on_break', 'paused_work', 'paused_break', 'paused'],
  }

  const allowedStatuses = allowed[action]
  if (!allowedStatuses || !allowedStatuses.includes(currentStatus)) {
    return `Cannot "${action}" when current state is "${currentStatus}".`
  }
  return null
}
