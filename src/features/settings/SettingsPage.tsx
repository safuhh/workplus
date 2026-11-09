/**
 * SettingsPage — allows the user to configure work target, break target, and timezone,
 * with full Dark/Light theme support.
 * Settings are persisted to Supabase; changing targets does NOT modify historical data.
 */

import { useState, type FormEvent } from 'react'
import { Save, Globe, Clock } from 'lucide-react'
import { Button, Card, ErrorAlert } from '../../components/ui'
import type { UseSettingsReturn } from '../../hooks/useSettings'

// Common IANA timezones for the picker (non-exhaustive; user can type any IANA tz)
const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Colombo',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]

interface SettingsPageProps {
  settingsHook: UseSettingsReturn
}

export function SettingsPage({ settingsHook }: SettingsPageProps) {
  const { effectiveSettings, saveSettings, loading, error } = settingsHook

  const [workHours, setWorkHours] = useState(
    () => Math.floor(effectiveSettings.work_target_seconds / 3600),
  )
  const [workMinutes, setWorkMinutes] = useState(
    () => Math.floor((effectiveSettings.work_target_seconds % 3600) / 60),
  )
  const [breakMinutes, setBreakMinutes] = useState(
    () => Math.floor(effectiveSettings.break_target_seconds / 60),
  )
  const [timezone, setTimezone] = useState(() => effectiveSettings.timezone)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)

    const workTargetSeconds = workHours * 3600 + workMinutes * 60
    const breakTargetSeconds = breakMinutes * 60

    if (workTargetSeconds <= 0) {
      setSaveError('Work target must be greater than 0.')
      return
    }
    if (breakTargetSeconds < 0) {
      setSaveError('Break target cannot be negative.')
      return
    }

    setSaving(true)
    try {
      await saveSettings({ work_target_seconds: workTargetSeconds, break_target_seconds: breakTargetSeconds, timezone })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-3">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 dark:border-brand-900 dark:border-t-brand-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Configure your daily targets and timezone</p>
      </div>

      {error && <ErrorAlert message={error} />}
      {saveError && <ErrorAlert message={saveError} onDismiss={() => setSaveError(null)} />}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {/* Work target */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-work-600 dark:text-work-400" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Daily work target</h2>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label htmlFor="work-hours" className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Hours</label>
              <input
                id="work-hours"
                type="number"
                min={0}
                max={23}
                value={workHours}
                onChange={(e) => setWorkHours(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <span className="text-slate-300 dark:text-slate-600 text-lg mt-5">:</span>
            <div>
              <label htmlFor="work-minutes" className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Minutes</label>
              <input
                id="work-minutes"
                type="number"
                min={0}
                max={59}
                value={workMinutes}
                onChange={(e) => setWorkMinutes(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Default: 8 hours. Total: {workHours}h {workMinutes}m</p>
        </Card>

        {/* Break target */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-break-600 dark:text-break-400" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Break allowance</h2>
          </div>
          <div>
            <label htmlFor="break-minutes" className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Minutes</label>
            <input
              id="break-minutes"
              type="number"
              min={0}
              max={480}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Default: 60 minutes. Tracking continues beyond this limit.</p>
        </Card>

        {/* Timezone */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Timezone</h2>
          </div>
          <div>
            <label htmlFor="timezone" className="block text-xs text-slate-400 dark:text-slate-500 mb-1">
              IANA timezone (e.g. Asia/Kolkata)
            </label>
            <input
              id="timezone"
              list="timezone-list"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <datalist id="timezone-list">
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Detected: <span className="font-medium text-slate-600 dark:text-slate-300">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </p>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={saving}>
            <Save className="h-4 w-4" />
            Save settings
          </Button>
          {saved && (
            <span className="text-sm text-work-600 dark:text-work-400 font-medium">Settings saved ✓</span>
          )}
        </div>
      </form>

      <Card className="p-4 bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800">
        <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          <strong className="text-slate-600 dark:text-slate-300">Note:</strong> Changing targets applies to future calculations only.
          Historical time entries are never modified.
        </p>
      </Card>
    </div>
  )
}
