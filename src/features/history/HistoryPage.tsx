/**
 * HistoryPage — displays past workdays grouped by local date with Dark/Light theme support.
 * Allows deleting individual work history records with confirmation, loading states,
 * and immediate local state updates without requiring a page refresh.
 */

import { useEffect, useState, useCallback } from 'react'
import { Calendar, CheckCircle, XCircle, Trash2, AlertTriangle } from 'lucide-react'
import { Card, Badge, Button, ErrorAlert, SuccessAlert } from '../../components/ui'
import { ActivityTimeline } from '../timer/ActivityTimeline'
import { fetchHistory, deleteWorkSession, type DayHistory } from '../../domain/time-tracking/queries'
import {
  formatDurationHuman,
  formatDate,
  sumEntrySeconds,
} from '../../domain/time-tracking/calculations'
import type { UserSettings } from '../../types'

interface HistoryPageProps {
  settings: UserSettings
}

export function HistoryPage({ settings }: HistoryPageProps) {
  const [history, setHistory] = useState<DayHistory[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Deletion modal state
  const [sessionToDelete, setSessionToDelete] = useState<DayHistory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchHistory(60)
      .then((h) => {
        if (!cancelled) {
          setHistory(h)
          setError(null)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const handleRequestDelete = (item: DayHistory) => {
    setDeleteError(null)
    setSessionToDelete(item)
  }

  const handleCancelDelete = useCallback(() => {
    if (deleting) return
    setSessionToDelete(null)
    setDeleteError(null)
  }, [deleting])

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return
    setDeleting(true)
    setDeleteError(null)

    const dateLabel = formatDate(
      new Date(sessionToDelete.session.work_date + 'T00:00:00'),
      settings.timezone
    )

    try {
      await deleteWorkSession(sessionToDelete.session.id)
      // Immediate state update without page reload
      setHistory((prev) => (prev ? prev.filter((h) => h.session.id !== sessionToDelete.session.id) : null))
      setSuccessMessage(`Work history for ${dateLabel} was permanently deleted.`)
      setSessionToDelete(null)
      setError(null)
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete record. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  // Handle ESC key to dismiss confirmation modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sessionToDelete && !deleting) {
        handleCancelDelete()
      }
    },
    [sessionToDelete, deleting, handleCancelDelete]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-3">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-900 dark:border-t-brand-400" />
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading history…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Work History</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Your past workdays and activity</p>
      </div>

      {successMessage && (
        <SuccessAlert
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {!error && history?.length === 0 && (
        <Card className="p-12 flex flex-col items-center gap-3 text-center">
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-4 text-slate-400 dark:text-slate-500">
            <Calendar className="h-8 w-8" />
          </div>
          <p className="text-slate-600 dark:text-slate-300 font-medium">No history yet</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">Start your first workday to see it here.</p>
        </Card>
      )}

      {history?.map((item) => (
        <HistoryDayCard
          key={item.session.id}
          item={item}
          settings={settings}
          onRequestDelete={() => handleRequestDelete(item)}
        />
      ))}

      {/* Delete Confirmation Modal Dialog */}
      {sessionToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              handleCancelDelete()
            }
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-warn-50 dark:bg-warn-950/60 text-warn-600 dark:text-warn-400 flex-shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="delete-dialog-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  Delete Work Record?
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Are you sure you want to permanently delete the work record for{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatDate(new Date(sessionToDelete.session.work_date + 'T00:00:00'), settings.timezone)}
                  </span>
                  ?
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  All {sessionToDelete.entries.length} recorded interval{sessionToDelete.entries.length === 1 ? '' : 's'} for this day will be permanently removed. This action cannot be undone.
                </p>
              </div>
            </div>

            {deleteError && (
              <ErrorAlert message={deleteError} onDismiss={() => setDeleteError(null)} />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCancelDelete}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                loading={deleting}
              >
                Delete Record
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Separated into its own component so nowMs is captured once per card render.
function HistoryDayCard({
  item,
  settings,
  onRequestDelete,
}: {
  item: DayHistory
  settings: UserSettings
  onRequestDelete: () => void
}) {
  const { session, entries } = item
  const [nowMs] = useState(() => Date.now())
  const workSecs = sumEntrySeconds(entries, 'work', nowMs)
  const breakSecs = sumEntrySeconds(entries, 'break', nowMs)
  const targetMet = workSecs >= settings.work_target_seconds
  const isCompleted = session.status === 'completed'
  const dateLabel = formatDate(new Date(session.work_date + 'T00:00:00'), settings.timezone)

  return (
    <Card className="p-5 space-y-4">
      {/* Day header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{dateLabel}</h2>
            {!isCompleted ? (
              <Badge variant={session.status === 'working' ? 'work' : session.status === 'on_break' ? 'break' : 'warning'}>
                {session.status === 'working' ? 'Working' : session.status === 'on_break' ? 'On Break' : 'Paused'}
              </Badge>
            ) : (
              <Badge variant="completed">Completed</Badge>
            )}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 space-x-3">
            <span>Work: <span className="font-medium text-slate-700 dark:text-slate-300">{formatDurationHuman(workSecs)}</span></span>
            <span>Break: <span className="font-medium text-slate-700 dark:text-slate-300">{formatDurationHuman(breakSecs)}</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {targetMet ? (
            <span className="flex items-center gap-1 text-xs text-work-600 dark:text-work-400 font-medium">
              <CheckCircle className="h-4 w-4" /> Target met
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 font-medium">
              <XCircle className="h-4 w-4" /> Target not met
            </span>
          )}

          {/* Delete history button */}
          <button
            type="button"
            onClick={onRequestDelete}
            className="p-1.5 text-slate-400 hover:text-warn-600 dark:hover:text-warn-400 hover:bg-warn-50 dark:hover:bg-warn-950/40 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-warn-500"
            title={`Delete history for ${dateLabel}`}
            aria-label={`Delete record for ${dateLabel}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <ActivityTimeline entries={entries} timezone={settings.timezone} nowMs={nowMs} />
    </Card>
  )
}
