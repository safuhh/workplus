/**
 * Activity Timeline component — shows the chronological list of work/break intervals
 * for a workday, with start/end times and duration, with Dark/Light theme support.
 */

import { useState } from 'react'
import { Coffee, Briefcase } from 'lucide-react'
import { formatTime, formatDuration, elapsedSecondsForEntry } from '../../domain/time-tracking/calculations'
import type { TimeEntry } from '../../types'

interface TimelineProps {
  entries: TimeEntry[]
  timezone: string
  nowMs?: number
}

export function ActivityTimeline({ entries, timezone, nowMs }: TimelineProps) {
  const [fallbackNowMs] = useState(() => Date.now())
  const effectiveNowMs = nowMs ?? fallbackNowMs

  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
        No activity yet
      </div>
    )
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry, i) => {
        const isWork = entry.entry_type === 'work'
        const durationSecs = elapsedSecondsForEntry(entry, effectiveNowMs)
        const startTime = formatTime(new Date(entry.started_at), timezone)
        const endTime = entry.ended_at
          ? formatTime(new Date(entry.ended_at), timezone)
          : 'ongoing'

        return (
          <li
            key={entry.id}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 transition-colors ${
              isWork
                ? 'bg-work-50/80 dark:bg-work-950/30 border border-work-100/80 dark:border-work-900/40'
                : 'bg-break-50/80 dark:bg-break-950/30 border border-break-100/80 dark:border-break-900/40'
            }`}
          >
            {/* Icon */}
            <div
              className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                isWork
                  ? 'bg-work-100 dark:bg-work-900/60 text-work-700 dark:text-work-300'
                  : 'bg-break-100 dark:bg-break-900/60 text-break-700 dark:text-break-300'
              }`}
            >
              {isWork
                ? <Briefcase className="h-3.5 w-3.5" />
                : <Coffee className="h-3.5 w-3.5" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-semibold ${
                  isWork ? 'text-work-800 dark:text-work-300' : 'text-break-800 dark:text-break-300'
                }`}>
                  {isWork ? 'Work' : 'Break'}{' '}
                  <span className="text-slate-400 dark:text-slate-500 font-normal text-xs">#{i + 1}</span>
                </span>
                <span className={`text-sm font-mono font-bold tabular-nums ${
                  isWork ? 'text-work-600 dark:text-work-400' : 'text-break-600 dark:text-break-400'
                }`}>
                  {formatDuration(durationSecs)}
                </span>
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                {startTime} → {endTime}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
