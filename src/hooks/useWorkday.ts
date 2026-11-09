/**
 * useWorkday hook — the core persistent background time-tracking engine.
 *
 * Implements a pure timestamp-based architecture using Supabase PostgreSQL as the single source of truth:
 * - Persists UTC start timestamps (`started_at`) and interval boundaries (`ended_at`) in PostgreSQL.
 * - Closing browser tab, closing browser, or device sleep NEVER stops active timers.
 * - Restores active sessions and computes elapsed duration instantly from persisted timestamps on reopen.
 * - Synchronizes with Supabase PostgreSQL server time to eliminate local device clock drift.
 * - Handles all browser lifecycle events: tab closure, refresh, reopen, minimize, OS sleep/wake, and network online/offline.
 * - Accurately computes running vs paused durations: paused intervals are strictly excluded.
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { useAuth } from '../features/auth/context'
import {
  fetchActiveSession,
  fetchEntriesForSession,
  fetchServerTime,
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
  isOnline: boolean
  lastSyncedAt: Date | null
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
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  // Server clock offset in milliseconds (serverTime - clientTime) to avoid local device clock drift
  const serverOffsetRef = useRef<number>(0)
  const lastTickRef = useRef<number>(Date.now())

  const getEffectiveNowMs = useCallback(() => {
    return Date.now() + serverOffsetRef.current
  }, [])

  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // ── Synchronize Authoritative Server Time ──────────────────────────────────
  const syncServerTime = useCallback(async () => {
    try {
      const serverTime = await fetchServerTime()
      if (serverTime) {
        serverOffsetRef.current = serverTime.getTime() - Date.now()
        setNowMs(Date.now() + serverOffsetRef.current)
      }
    } catch {
      // Fallback gracefully to device clock if server time check fails
    }
  }, [])

  // ── Load active session from Supabase ──────────────────────────────────────
  const loadActiveSession = useCallback(async () => {
    if (!user) {
      setSession(null)
      setEntries([])
      setLoading(false)
      return
    }
    try {
      // Synchronize clock offset alongside session fetch
      void syncServerTime()

      const s = await fetchActiveSession(settings.timezone)
      setSession(s)
      if (s) {
        const e = await fetchEntriesForSession(s.id)
        setEntries(e)
      } else {
        setEntries([])
      }
      setLastSyncedAt(new Date())
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }, [user, settings.timezone, syncServerTime])

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    void loadActiveSession()
  }, [loadActiveSession])

  // ── 1-second display tick (no DB writes) with OS Sleep/Wake detection ──────
  // Only ticks when a timer is actively running (working or on_break)
  const isTimerRunning = session?.status === 'working' || session?.status === 'on_break'
  useEffect(() => {
    if (!isTimerRunning) return
    lastTickRef.current = Date.now()

    const interval = setInterval(() => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now

      // OS Sleep / background suspension detection:
      // If delta > 2500ms, the OS suspended JS execution (laptop closed/sleep).
      // Immediately calculate true elapsed time and resync with Supabase.
      if (delta > 2500) {
        setNowMs(now + serverOffsetRef.current)
        void loadActiveSession()
      } else {
        setNowMs(now + serverOffsetRef.current)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isTimerRunning, loadActiveSession])

  // ── Browser Lifecycle & Network Event Listeners ───────────────────────────
  useEffect(() => {
    function handleResync() {
      setNowMs(Date.now() + serverOffsetRef.current)
      if (session) {
        void loadActiveSession()
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        handleResync()
      }
    }

    function onFocus() {
      handleResync()
    }

    function onPageShow() {
      handleResync()
    }

    function onOnline() {
      setIsOnline(true)
      handleResync()
    }

    function onOffline() {
      setIsOnline(false)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
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
      setLastSyncedAt(new Date())
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
      setNowMs(getEffectiveNowMs())
      setLastSyncedAt(new Date())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset timer.'
      setError(msg)
      throw err
    } finally {
      setTransitioning(false)
    }
  }, [settings.timezone, getEffectiveNowMs])

  return {
    session,
    entries,
    computed,
    loading,
    error,
    transitioning,
    nowMs,
    isOnline,
    lastSyncedAt,
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
