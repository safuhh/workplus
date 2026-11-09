/**
 * DashboardPage — the main WorkPulse screen with full Dark/Light theme support.
 *
 * Provides dedicated controls for both Work and Break sessions:
 * - Start: Start the timer
 * - Pause: Temporarily pause the timer
 * - Resume: Continue the timer from where it was paused
 * - Stop: Completely stop and save the current session
 * - Reset: Safely reset today's tracked work and break data to 00:00:00 with confirmation
 *
 * Persists all state and intervals in Supabase UTC instants, ensuring
 * accurate elapsed durations and state retention across browser refreshes.
 */

import { useState, useEffect } from 'react'
import {
  Play,
  Pause,
  Square,
  Briefcase,
  Coffee,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Clock,
} from 'lucide-react'
import { Button, Card, ProgressBar, ErrorAlert, SuccessAlert, Badge } from '../../components/ui'
import { ActivityTimeline } from './ActivityTimeline'
import { useWorkday } from '../../hooks/useWorkday'
import {
  formatDuration,
  formatDurationHuman,
  formatTime,
} from '../../domain/time-tracking/calculations'
import type { UserSettings } from '../../types'

interface DashboardPageProps {
  settings: UserSettings
}

export function DashboardPage({ settings }: DashboardPageProps) {
  const {
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
    resetTodayTimer,
    refresh,
  } = useWorkday(settings)

  const [showStopWorkConfirm, setShowStopWorkConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [confirmActiveDiscard, setConfirmActiveDiscard] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [dismissedError, setDismissedError] = useState(false)

  // Keyboard navigation: Escape dismisses open modals
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showResetConfirm && !resetting) {
          setShowResetConfirm(false)
          setConfirmActiveDiscard(false)
          setResetError(null)
        }
        if (showStopWorkConfirm && !transitioning) {
          setShowStopWorkConfirm(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showResetConfirm, resetting, showStopWorkConfirm, transitioning])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-3">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-900 dark:border-t-brand-400" />
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading your workday…</p>
      </div>
    )
  }

  const {
    currentState,
    workSeconds,
    breakSeconds,
    remainingWorkSeconds,
    remainingBreakSeconds,
    breakOverrunSeconds,
    workProgressPct,
    breakProgressPct,
    projectedFinishAt,
    isWorkRunning,
    isWorkPaused,
    isBreakRunning,
    isBreakPaused,
  } = computed

  const isCompleted = currentState === 'completed'
  const isTimerRunning = isWorkRunning || isBreakRunning
  const hasActiveSession = session !== null && !isCompleted
  const displayedError = error && !dismissedError && !showResetConfirm ? error : null

  // Overall status config
  const statusConfig = (() => {
    if (isCompleted) {
      return { label: 'Day Completed', color: 'text-brand-600 dark:text-brand-400', dot: 'bg-brand-500' }
    }
    if (isWorkRunning) {
      return { label: 'Working', color: 'text-work-600 dark:text-work-400', dot: 'bg-work-500 animate-pulse' }
    }
    if (isBreakRunning) {
      return { label: 'On Break', color: 'text-break-600 dark:text-break-400', dot: 'bg-break-500 animate-pulse' }
    }
    if (isWorkPaused) {
      return { label: 'Work Paused', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' }
    }
    if (isBreakPaused) {
      return { label: 'Break Paused', color: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' }
    }
    return { label: 'Ready to Start', color: 'text-slate-500 dark:text-slate-400', dot: 'bg-slate-300 dark:bg-slate-600' }
  })()

  // Handler for Stop Work confirmation
  const handleConfirmStopWork = async () => {
    setShowStopWorkConfirm(false)
    await stopWork()
  }

  // Handler for Reset Timer confirmation
  const handleConfirmReset = async () => {
    setResetting(true)
    setResetError(null)
    try {
      await resetTodayTimer()
      setShowResetConfirm(false)
      setConfirmActiveDiscard(false)
      setSuccessMessage("Today's work and break timers have been successfully reset to 00:00:00.")
      setDismissedError(false)
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset timer. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Offline Alert */}
      {!isOnline && (
        <div
          className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2.5"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span>You are currently offline. Timers continue tracking elapsed time in the background and will sync when reconnected.</span>
        </div>
      )}

      {/* Success alert */}
      {successMessage && (
        <SuccessAlert message={successMessage} onDismiss={() => setSuccessMessage(null)} />
      )}

      {/* Error alert */}
      {displayedError && (
        <ErrorAlert message={displayedError} onDismiss={() => setDismissedError(true)} />
      )}

      {/* Confirmation Modal: Reset Timer */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetting) {
              setShowResetConfirm(false)
              setConfirmActiveDiscard(false)
              setResetError(null)
            }
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div className="bg-warn-50 dark:bg-warn-950/60 rounded-xl p-2.5 text-warn-500 flex-shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="reset-dialog-title" className="font-semibold text-slate-900 dark:text-white text-base">
                  Reset Today's Timer?
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Reset current day's work and break time to zero
                </p>
              </div>
            </div>

            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2.5">
              <p>
                This will permanently reset today's tracked work and break totals to <span className="font-semibold text-slate-800 dark:text-slate-200">00:00:00</span> and clear today's activity timeline.
              </p>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-xs space-y-1.5 border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Current Work Time:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDuration(workSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Current Break Time:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDuration(breakSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Recorded Intervals:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{entries.length}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Remaining work and break allowances will be restored to full daily targets. Previous days' history remains completely safe.
              </p>
            </div>

            {/* Warning if a timer is currently actively running */}
            {isTimerRunning && (
              <div className="space-y-2 pt-1">
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium">⚠️ A timer is actively running right now!</p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                    Resetting will immediately discard the running session.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={confirmActiveDiscard}
                    onChange={(e) => setConfirmActiveDiscard(e.target.checked)}
                    className="mt-0.5 rounded text-warn-600 focus:ring-warn-500 cursor-pointer"
                  />
                  <span>I understand and explicitly confirm that the active running session will also be discarded.</span>
                </label>
              </div>
            )}

            {resetError && (
              <ErrorAlert message={resetError} onDismiss={() => setResetError(null)} />
            )}

            <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setShowResetConfirm(false)
                  setConfirmActiveDiscard(false)
                  setResetError(null)
                }}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => void handleConfirmReset()}
                loading={resetting}
                disabled={(isTimerRunning && !confirmActiveDiscard) || resetting}
              >
                Reset Timer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Stop Workday */}
      {showStopWorkConfirm && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stop-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !transitioning) {
              setShowStopWorkConfirm(false)
            }
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="bg-warn-50 dark:bg-warn-950/60 rounded-xl p-2.5">
                <AlertTriangle className="h-5 w-5 text-warn-500" />
              </div>
              <div>
                <h2 id="stop-dialog-title" className="font-semibold text-slate-900 dark:text-white">Stop Workday?</h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">Save and finalize today's session</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              This will close any open interval and mark today's workday as completed.
              All your work time ({formatDurationHuman(workSeconds)}) and break time ({formatDurationHuman(breakSeconds)}) will be securely saved.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowStopWorkConfirm(false)}
                disabled={transitioning}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => void handleConfirmStopWork()}
                loading={transitioning}
              >
                Stop & Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar: Status + Actions (Reset, Sync) */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className={`w-3 h-3 rounded-full ${statusConfig.dot}`} />
          <span className={`text-sm font-semibold tracking-wide ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Reset Button */}
          <button
            type="button"
            onClick={() => {
              setConfirmActiveDiscard(false)
              setResetError(null)
              setShowResetConfirm(true)
            }}
            disabled={transitioning || resetting}
            className="text-xs text-warn-600 dark:text-warn-400 hover:text-warn-700 dark:hover:text-warn-300 flex items-center gap-1.5 transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-warn-50 dark:hover:bg-warn-950/40 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            title="Reset today's timer"
            aria-label="Reset today's timer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          {/* Sync Button */}
          <button
            onClick={() => void refresh()}
            disabled={transitioning || resetting}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title={lastSyncedAt ? `Last synced at ${lastSyncedAt.toLocaleTimeString()}` : 'Resync with database'}
            aria-label="Resync with database"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${transitioning ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Two Main Cards: Work Session & Break Session */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── 1. Work Session Card ────────────────────────────────────── */}
        <Card className={`p-6 flex flex-col justify-between border-2 transition-all ${
          isWorkRunning
            ? 'border-work-400 dark:border-work-500 shadow-md ring-2 ring-work-100 dark:ring-work-950/40'
            : 'border-slate-100 dark:border-slate-800/80'
        }`}>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-work-50 dark:bg-work-950/60 text-work-600 dark:text-work-400">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">Work Time</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Target: {formatDurationHuman(settings.work_target_seconds)}</p>
                </div>
              </div>
              <div>
                {isWorkRunning ? (
                  <Badge variant="work">
                    <span className="w-1.5 h-1.5 rounded-full bg-work-500 animate-pulse" />
                    Running
                  </Badge>
                ) : isWorkPaused ? (
                  <Badge variant="warning">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Paused
                  </Badge>
                ) : isCompleted ? (
                  <Badge variant="completed">Completed</Badge>
                ) : (
                  <Badge variant="neutral">Standby</Badge>
                )}
              </div>
            </div>

            {/* Large Digital Timer */}
            <div className="text-center py-2">
              <div
                className="timer-digit text-5xl font-bold tracking-tight text-slate-900 dark:text-white"
                aria-label={`Work time: ${formatDuration(workSeconds)}`}
              >
                {formatDuration(workSeconds)}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {isWorkRunning
                  ? 'Actively tracking work seconds…'
                  : isWorkPaused
                  ? 'Timer paused — press Resume to continue'
                  : isCompleted
                  ? 'Work session finalized'
                  : 'Press Start to begin work'}
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>{formatDurationHuman(workSeconds)} completed</span>
                <span>{workProgressPct.toFixed(0)}%</span>
              </div>
              <ProgressBar value={workProgressPct} color="work" />
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
                {remainingWorkSeconds > 0 ? (
                  <span>{formatDurationHuman(remainingWorkSeconds)} remaining</span>
                ) : (
                  <span className="text-work-600 dark:text-work-400 font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Target reached!
                  </span>
                )}
                <span>Goal: {formatDurationHuman(settings.work_target_seconds)}</span>
              </div>
            </div>
          </div>

          {/* Work Controls: Start, Pause, Resume, Stop */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 mt-4">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-2">
              Work Controls
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* START */}
              <Button
                variant="work"
                size="sm"
                onClick={() => void startWork()}
                disabled={isWorkRunning || isWorkPaused || transitioning}
                loading={transitioning && !isWorkRunning && !isWorkPaused}
                title="Start work timer"
              >
                <Play className="h-3.5 w-3.5" />
                Start
              </Button>

              {/* PAUSE */}
              <Button
                variant="warning"
                size="sm"
                onClick={() => void pauseWork()}
                disabled={!isWorkRunning || transitioning}
                title="Temporarily pause work timer"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>

              {/* RESUME */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => void resumeWork()}
                disabled={(!isWorkPaused && !isBreakRunning) || isWorkRunning || isCompleted || transitioning}
                title="Continue work timer from where it was paused"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>

              {/* STOP */}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowStopWorkConfirm(true)}
                disabled={!hasActiveSession || transitioning}
                title="Completely stop and save the workday"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          </div>
        </Card>

        {/* ── 2. Break Session Card ────────────────────────────────────── */}
        <Card className={`p-6 flex flex-col justify-between border-2 transition-all ${
          isBreakRunning
            ? 'border-break-400 dark:border-break-500 shadow-md ring-2 ring-break-100 dark:ring-break-950/40'
            : 'border-slate-100 dark:border-slate-800/80'
        }`}>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-break-50 dark:bg-break-950/60 text-break-600 dark:text-break-400">
                  <Coffee className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">Break Time</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Allowance: {formatDurationHuman(settings.break_target_seconds)}</p>
                </div>
              </div>
              <div>
                {isBreakRunning ? (
                  <Badge variant="break">
                    <span className="w-1.5 h-1.5 rounded-full bg-break-500 animate-pulse" />
                    Running
                  </Badge>
                ) : isBreakPaused ? (
                  <Badge variant="warning">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Paused
                  </Badge>
                ) : isCompleted ? (
                  <Badge variant="completed">Completed</Badge>
                ) : (
                  <Badge variant="neutral">Idle</Badge>
                )}
              </div>
            </div>

            {/* Large Digital Timer */}
            <div className="text-center py-2">
              <div
                className="timer-digit text-5xl font-bold tracking-tight text-slate-900 dark:text-white"
                aria-label={`Break time: ${formatDuration(breakSeconds)}`}
              >
                {formatDuration(breakSeconds)}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {isBreakRunning
                  ? 'Actively tracking break seconds…'
                  : isBreakPaused
                  ? 'Break paused — press Resume to continue'
                  : breakSeconds > 0
                  ? 'Break stopped — saved in timeline'
                  : 'Press Start to take a break'}
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>{formatDurationHuman(breakSeconds)} used</span>
                <span>{breakProgressPct.toFixed(0)}%</span>
              </div>
              <ProgressBar value={breakProgressPct} color="break" />
              <div className="flex justify-between text-xs">
                {breakOverrunSeconds > 0 ? (
                  <span className="text-warn-600 dark:text-warn-400 font-semibold">
                    +{formatDurationHuman(breakOverrunSeconds)} over allowance
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatDurationHuman(remainingBreakSeconds)} allowance remaining
                  </span>
                )}
                <span className="text-slate-400 dark:text-slate-500">Target: {formatDurationHuman(settings.break_target_seconds)}</span>
              </div>
            </div>
          </div>

          {/* Break Controls: Start, Pause, Resume, Stop */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 mt-4">
            <p className="text-xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 mb-2">
              Break Controls
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* START */}
              <Button
                variant="break"
                size="sm"
                onClick={() => void startBreak()}
                disabled={isBreakRunning || isBreakPaused || transitioning}
                loading={transitioning && isWorkRunning}
                title="Start break timer"
              >
                <Play className="h-3.5 w-3.5" />
                Start
              </Button>

              {/* PAUSE */}
              <Button
                variant="warning"
                size="sm"
                onClick={() => void pauseBreak()}
                disabled={!isBreakRunning || transitioning}
                title="Temporarily pause break timer"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>

              {/* RESUME */}
              <Button
                variant="break"
                size="sm"
                onClick={() => void resumeBreak()}
                disabled={!isBreakPaused || isCompleted || transitioning}
                title="Continue break timer from where it was paused"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>

              {/* STOP */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void stopBreak()}
                disabled={(!isBreakRunning && !isBreakPaused) || transitioning}
                title="Completely stop and save break session"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Projected Finish Time Banner */}
      {projectedFinishAt && !isCompleted && (
        <Card className="p-4 bg-gradient-to-r from-brand-50/50 to-work-50/50 dark:from-brand-950/30 dark:to-work-950/30 border-brand-100 dark:border-brand-900/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-xs text-brand-600 dark:text-brand-400">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Projected Finish Time
                </p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100 timer-digit">
                  {formatTime(projectedFinishAt, settings.timezone)}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs sm:text-right">
              Assumes you complete remaining work ({formatDurationHuman(remainingWorkSeconds)}) and use remaining break allowance ({formatDurationHuman(remainingBreakSeconds)}).
            </p>
          </div>
        </Card>
      )}

      {/* Activity Timeline */}
      {entries.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Today's Activity Timeline</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">{entries.length} interval{entries.length === 1 ? '' : 's'} recorded</span>
          </div>
          <ActivityTimeline entries={entries} timezone={settings.timezone} nowMs={nowMs} />
        </Card>
      )}
    </div>
  )
}
