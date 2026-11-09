// Core domain types for WorkPulse

export type WorkdayStatus =
  | 'working'
  | 'on_break'
  | 'paused_work'
  | 'paused_break'
  | 'paused'
  | 'completed'

export interface UserSettings {
  id: string
  timezone: string
  work_target_seconds: number
  break_target_seconds: number
  created_at: string
  updated_at: string
}

export interface WorkSession {
  id: string
  user_id: string
  work_date: string // local date YYYY-MM-DD
  timezone_snapshot: string
  status: WorkdayStatus
  started_at: string // timestamptz ISO string
  ended_at: string | null
  created_at: string
  updated_at: string
}

export type EntryType = 'work' | 'break'

export interface TimeEntry {
  id: string
  session_id: string
  user_id: string
  entry_type: EntryType
  started_at: string // timestamptz ISO string
  ended_at: string | null
  created_at: string
}

// Computed display state derived from session + entries + current time
export interface WorkdayComputed {
  workSeconds: number
  breakSeconds: number
  remainingWorkSeconds: number
  remainingBreakSeconds: number
  breakOverrunSeconds: number
  workProgressPct: number  // 0–100 capped
  breakProgressPct: number // 0–100 capped
  projectedFinishAt: Date | null
  currentState: 'not_started' | WorkdayStatus
  isWorkRunning: boolean
  isWorkPaused: boolean
  isBreakRunning: boolean
  isBreakPaused: boolean
}

// RPC response shapes
export interface StartWorkdayResponse {
  session: WorkSession
  entry: TimeEntry
}

export interface TransitionResponse {
  session: WorkSession
  entry: TimeEntry | null
}
