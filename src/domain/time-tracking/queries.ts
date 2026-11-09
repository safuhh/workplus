/**
 * Supabase data access layer for WorkPulse.
 * All queries for sessions, entries, history, and settings.
 */

import { supabase } from '../../lib/supabase/client'
import { getLocalWorkDate } from './calculations'
import type { UserSettings, WorkSession, TimeEntry } from '../../types'

// ─── Settings ───────────────────────────────────────────────────────────────

export async function fetchSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertSettings(
  userId: string,
  settings: Partial<Pick<UserSettings, 'timezone' | 'work_target_seconds' | 'break_target_seconds'>>,
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Active Session ──────────────────────────────────────────────────────────

/**
 * Fetch the currently active or today's workday session.
 * 1. Returns active/paused session if one exists.
 * 2. Otherwise returns today's local session (even if completed).
 * 3. Returns null if no session has been created for today.
 */
export async function fetchActiveSession(timezone: string = 'UTC'): Promise<WorkSession | null> {
  // 1. Check for active or paused session
  const { data: active, error: activeErr } = await supabase
    .from('work_sessions')
    .select('*')
    .in('status', ['working', 'on_break', 'paused_work', 'paused_break', 'paused'])
    .maybeSingle()
  if (activeErr) throw activeErr
  if (active) return active

  // 2. Check for today's session (e.g. completed)
  const todayDate = getLocalWorkDate(timezone)
  const { data: todaySession, error: todayErr } = await supabase
    .from('work_sessions')
    .select('*')
    .eq('work_date', todayDate)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (todayErr) throw todayErr
  return todaySession
}

/**
 * Fetch all time entries for a given session.
 */
export async function fetchEntriesForSession(sessionId: string): Promise<TimeEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('started_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface DayHistory {
  session: WorkSession
  entries: TimeEntry[]
}

/**
 * Fetch completed and active sessions (sorted newest first) with their entries.
 */
export async function fetchHistory(limit = 30): Promise<DayHistory[]> {
  const { data: sessions, error } = await supabase
    .from('work_sessions')
    .select('*')
    .order('work_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  if (!sessions || sessions.length === 0) return []

  const sessionIds = sessions.map((s) => s.id)
  const { data: entries, error: eError } = await supabase
    .from('time_entries')
    .select('*')
    .in('session_id', sessionIds)
    .order('started_at', { ascending: true })
  if (eError) throw eError

  return sessions.map((session) => ({
    session,
    entries: (entries ?? []).filter((e) => e.session_id === session.id),
  }))
}

/**
 * Permanently delete a work session.
 * Associated time entries are deleted automatically via ON DELETE CASCADE.
 * Protected by Row Level Security (only user_id = auth.uid() can delete).
 */
export async function deleteWorkSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('work_sessions')
    .delete()
    .eq('id', sessionId)
  if (error) throw error
}

// ─── State Transitions (via RPC) ─────────────────────────────────────────────

/**
 * Start a work session.
 */
export async function rpcStartWork(
  timezone: string = 'UTC',
): Promise<{ session: WorkSession; entry: TimeEntry }> {
  const { data, error } = await supabase.rpc('start_work', { p_timezone: timezone })
  if (error) throw error
  return data as { session: WorkSession; entry: TimeEntry }
}

/**
 * Alias for start_workday.
 */
export async function rpcStartWorkday(
  timezone: string = 'UTC',
): Promise<{ session: WorkSession; entry: TimeEntry }> {
  const { data, error } = await supabase.rpc('start_workday', { p_timezone: timezone })
  if (error) throw error
  return data as { session: WorkSession; entry: TimeEntry }
}

/**
 * Pause the active work timer.
 */
export async function rpcPauseWork(): Promise<{ session: WorkSession; entry: null }> {
  const { data, error } = await supabase.rpc('pause_work')
  if (error) throw error
  return data as { session: WorkSession; entry: null }
}

/**
 * Resume work from pause or break.
 */
export async function rpcResumeWork(): Promise<{ session: WorkSession; entry: TimeEntry }> {
  const { data, error } = await supabase.rpc('resume_work')
  if (error) throw error
  return data as { session: WorkSession; entry: TimeEntry }
}

/**
 * Stop work and complete the workday session.
 */
export async function rpcStopWork(): Promise<{ session: WorkSession; entry: null }> {
  const { data, error } = await supabase.rpc('stop_work')
  if (error) throw error
  return data as { session: WorkSession; entry: null }
}

/**
 * Alias for finish_workday.
 */
export async function rpcFinishWorkday(): Promise<{ session: WorkSession }> {
  const { data, error } = await supabase.rpc('finish_workday')
  if (error) throw error
  return data as { session: WorkSession }
}

/**
 * Start a break timer.
 */
export async function rpcStartBreak(
  timezone: string = 'UTC',
): Promise<{ session: WorkSession; entry: TimeEntry }> {
  const { data, error } = await supabase.rpc('start_break', { p_timezone: timezone })
  if (error) throw error
  return data as { session: WorkSession; entry: TimeEntry }
}

/**
 * Pause the active break timer.
 */
export async function rpcPauseBreak(): Promise<{ session: WorkSession; entry: null }> {
  const { data, error } = await supabase.rpc('pause_break')
  if (error) throw error
  return data as { session: WorkSession; entry: null }
}

/**
 * Resume a paused break timer.
 */
export async function rpcResumeBreak(): Promise<{ session: WorkSession; entry: TimeEntry }> {
  const { data, error } = await supabase.rpc('resume_break')
  if (error) throw error
  return data as { session: WorkSession; entry: TimeEntry }
}

/**
 * Stop the break session and save break time.
 */
export async function rpcStopBreak(): Promise<{ session: WorkSession; entry: null }> {
  const { data, error } = await supabase.rpc('stop_break')
  if (error) throw error
  return data as { session: WorkSession; entry: null }
}

/**
 * Reset today's timer: atomically deletes today's session and all associated
 * time entries for the current user in Supabase, leaving historical days untouched.
 */
export async function rpcResetTodayTimer(
  timezone: string = 'UTC',
): Promise<{ success: boolean; deleted: boolean; work_date: string }> {
  const { data, error } = await supabase.rpc('reset_today_timer', { p_timezone: timezone })
  if (error) {
    // Fallback: delete today's session directly if RPC is unavailable
    const todayDate = getLocalWorkDate(timezone)
    const { data: sessions, error: fetchErr } = await supabase
      .from('work_sessions')
      .select('id')
      .eq('work_date', todayDate)
    if (fetchErr) throw error
    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        await deleteWorkSession(s.id)
      }
    }
    return { success: true, deleted: (sessions?.length ?? 0) > 0, work_date: todayDate }
  }
  return data as { success: boolean; deleted: boolean; work_date: string }
}
