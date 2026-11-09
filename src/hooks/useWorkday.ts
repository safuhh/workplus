/**
 * useWorkday hook — the core timer state manager.
 *
 * - Loads the active session and entries from Supabase on mount.
 * - Recovers correctly after refresh, tab close, or OS sleep.
 * - Drives a 1-second display tick (never writes to DB every second).
 * - Resyncs from Supabase on page visibility restore (after sleep/suspend).
 * - Provides full Start, Pause, Resume, Stop controls for Work and Break timers.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../features/auth/context'
import {
  fetchActiveSession,
  fetchEntriesForSession,
  rpcStartWork,
  rpcPauseWork,
  rpcResumeWork,
  rpcStopWork,
  rpcStartBreak,
  rpcPauseBreak,
  rpcResumeBreak,
  rpcStopBreak,
  rpcStartWorkday,
  rpcFinishWorkday,
  rpcResetTodayTimer,
} from '../domain/time-tracking/queries'
import { computeWorkdayState } from '../domain/time-tracking/calculations'
import type { TimeEntry, WorkSession, WorkdayComputed } from '../types'
import type { UserSettings } from '../types'

export interface UseWorkdayReturn {
  session: WorkSession | null
  entries: TimeEntry[]
  computed: WorkdayComputed
  loading: boolean
  error: string | null
  transitioning: boolean
  nowMs: number
  startWork: () => Promise<void>
  pauseWork: () => Promise<void>
  resumeWork: () => Promise<void>
  stopWork: () => Promise<void>
  startBreak: () => Promise<void>
  pauseBreak: () => Promise<void>
  resumeBreak: () => Promise<void>
  stopBreak: () => Promise<void>
  startWorkday: () => Promise<void>
  finishWorkday: () => Promise<void>
  resetTodayTimer: () => Promise<void>
  refresh: () => Promise<void>
}

export function useWorkday(settings: UserSettings): UseWorkdayReturn {
  const { user } = useAuth()
  const [session, setSession] = useState<WorkSession | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // ── Load active session from Supabase ──────────────────────────────────────
  const loadActiveSession = useCallback(async () => {
    if (!user) {
      setSession(null)
      setEntries([])
      setLoading(false)
      return
    }
    try {
      const s = await fetchActiveSession(settings.timezone)
      setSession(s)
      if (s) {
        const e = await fetchEntriesForSession(s.id)
        setEntries(e)
      } else {
        setEntries([])
      }
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }, [user, settings.timezone])

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    void loadActiveSession()
  }, [loadActiveSession])

  // ── 1-second display tick (no DB writes) ──────────────────────────────────
  // Only tick when a timer is actively running (working or on_break)
  const isTimerRunning = session?.status === 'working' || session?.status === 'on_break'
  useEffect(() => {
    if (!isTimerRunning) return
    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning])

  // ── Page Visibility: resync after tab becomes active (sleep recovery) ─────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && session) {
        void loadActiveSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [loadActiveSession, session])

  // ── Computed display values ───────────────────────────────────────────────
  const computed: WorkdayComputed = computeWorkdayState(session, entries, settings, nowMs)

  // ── Transition helpers ────────────────────────────────────────────────────
  async function withTransition<T>(
    fn: () => Promise<T>,
    onSuccess: (result: T) => void,
  ) {
    setTransitioning(true)
    setError(null)
    try {
      const result = await fn()
      onSuccess(result)
      // Refresh entries and session to guarantee consistency with DB timestamps
      void loadActiveSession()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  // Work session controls
  const startWork = useCallback(() =>
    withTransition(
      () => rpcStartWork(settings.timezone),
      ({ session: s, entry }) => {
        setSession(s)
        setEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry])
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [settings.timezone])

  const pauseWork = useCallback(() =>
    withTransition(
      () => rpcPauseWork(),
      ({ session: s }) => {
        setSession(s)
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  const resumeWork = useCallback(() =>
    withTransition(
      () => rpcResumeWork(),
      ({ session: s, entry }) => {
        setSession(s)
        setEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry])
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  const stopWork = useCallback(() =>
    withTransition(
      () => rpcStopWork(),
      ({ session: s }) => {
        setSession(s)
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  // Break session controls
  const startBreak = useCallback(() =>
    withTransition(
      () => rpcStartBreak(settings.timezone),
      ({ session: s, entry }) => {
        setSession(s)
        setEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry])
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [settings.timezone])

  const pauseBreak = useCallback(() =>
    withTransition(
      () => rpcPauseBreak(),
      ({ session: s }) => {
        setSession(s)
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  const resumeBreak = useCallback(() =>
    withTransition(
      () => rpcResumeBreak(),
      ({ session: s, entry }) => {
        setSession(s)
        setEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry])
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  const stopBreak = useCallback(() =>
    withTransition(
      () => rpcStopBreak(),
      ({ session: s }) => {
        setSession(s)
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  // Backward-compatible aliases
  const startWorkday = useCallback(() =>
    withTransition(
      () => rpcStartWorkday(settings.timezone),
      ({ session: s, entry }) => {
        setSession(s)
        setEntries([entry])
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [settings.timezone])

  const finishWorkday = useCallback(() =>
    withTransition(
      () => rpcFinishWorkday(),
      ({ session: s }) => {
        setSession(s)
      },
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [])

  const resetTodayTimer = useCallback(async () => {
    setTransitioning(true)
    setError(null)
    try {
      await rpcResetTodayTimer(settings.timezone)
      // Immediately reset local state to empty
      setSession(null)
      setEntries([])
      setNowMs(Date.now())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset timer.'
      setError(msg)
      throw err
    } finally {
      setTransitioning(false)
    }
  }, [settings.timezone])

  return {
    session,
    entries,
    computed,
    loading,
    error,
    transitioning,
    nowMs,
    startWork,
    pauseWork,
    resumeWork,
    stopWork,
    startBreak,
    pauseBreak,
    resumeBreak,
    stopBreak,
    startWorkday,
    finishWorkday,
    resetTodayTimer,
    refresh: loadActiveSession,
  }
}
