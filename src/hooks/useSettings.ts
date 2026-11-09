/**
 * useSettings hook — loads and persists user settings from Supabase.
 * Provides defaults (8h work, 1h break, detected timezone) if settings not yet saved.
 */

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../features/auth/context'
import { fetchSettings, upsertSettings } from '../domain/time-tracking/queries'
import type { UserSettings } from '../types'

const DEFAULT_SETTINGS: Omit<UserSettings, 'id' | 'created_at' | 'updated_at'> = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
  work_target_seconds: 28800,  // 8 hours
  break_target_seconds: 3600,  // 1 hour
}

export interface UseSettingsReturn {
  settings: UserSettings | null
  loading: boolean
  error: string | null
  effectiveSettings: UserSettings
  saveSettings: (
    updates: Partial<Pick<UserSettings, 'timezone' | 'work_target_seconds' | 'break_target_seconds'>>,
  ) => Promise<void>
}

export function useSettings(): UseSettingsReturn {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loading = Boolean(user) && loadedUserId !== user?.id

  useEffect(() => {
    let cancelled = false
    if (!user) {
      return
    }

    fetchSettings(user.id)
      .then((s) => {
        if (!cancelled) {
          setSettings(s)
          setError(null)
          setLoadedUserId(user.id)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings.')
          setLoadedUserId(user.id)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const saveSettings = useCallback(
    async (
      updates: Partial<Pick<UserSettings, 'timezone' | 'work_target_seconds' | 'break_target_seconds'>>,
    ) => {
      if (!user) throw new Error('Not authenticated')
      const updated = await upsertSettings(user.id, updates)
      setSettings(updated)
    },
    [user],
  )

  const currentSettings = user ? settings : null

  // Effective settings: saved settings or defaults
  const effectiveSettings: UserSettings = currentSettings ?? {
    id: user?.id ?? '',
    created_at: '',
    updated_at: '',
    ...DEFAULT_SETTINGS,
  }

  return { settings: currentSettings, loading, error, effectiveSettings, saveSettings }
}
