/**
 * Shared reusable UI components for WorkPulse with full Dark Mode & Light Mode support.
 */

import { type ButtonHTMLAttributes, type ReactNode } from 'react'

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'work' | 'break' | 'warning'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 hover:bg-brand-700 text-white focus-visible:ring-brand-500 shadow-sm',
  secondary:
    'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 focus-visible:ring-brand-500 shadow-xs',
  danger:
    'bg-warn-500 hover:bg-warn-600 text-white focus-visible:ring-warn-500 shadow-xs',
  ghost:
    'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 focus-visible:ring-brand-500',
  work:
    'bg-work-600 hover:bg-work-700 text-white focus-visible:ring-work-500 shadow-xs',
  break:
    'bg-break-600 hover:bg-break-700 text-white focus-visible:ring-break-500 shadow-xs',
  warning:
    'bg-amber-500 hover:bg-amber-600 text-white focus-visible:ring-amber-500 shadow-xs',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled ?? loading}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl transition-all cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : null}
      {children}
    </button>
  )
}

// ── Progress Bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number      // 0–100
  color?: 'work' | 'break' | 'brand'
  className?: string
}

const progressColors: Record<string, string> = {
  work: 'bg-work-500',
  break: 'bg-break-500',
  brand: 'bg-brand-500',
}

export function ProgressBar({ value, color = 'brand', className = '' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  const isExceeded = value >= 100
  return (
    <div className={`h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${isExceeded && color === 'break' ? 'bg-warn-500' : progressColors[color]}`}
        style={{ width: `${clamped}%` }}
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-xs text-slate-900 dark:text-slate-100 transition-colors ${className}`}>
      {children}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = 'work' | 'break' | 'completed' | 'neutral' | 'warning'

const badgeClasses: Record<BadgeVariant, string> = {
  work: 'bg-work-50 dark:bg-work-950/60 text-work-700 dark:text-work-300 border border-work-200 dark:border-work-800/60',
  break: 'bg-break-50 dark:bg-break-950/60 text-break-700 dark:text-break-300 border border-break-200 dark:border-break-800/60',
  completed: 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/60',
  neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  warning: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
}

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClasses[variant]}`}>
      {children}
    </span>
  )
}

// ── Error Alert ──────────────────────────────────────────────────────────────

export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="rounded-xl bg-warn-50 dark:bg-warn-950/40 border border-warn-100 dark:border-warn-900/60 px-4 py-3 flex items-start gap-3">
      <svg className="w-4 h-4 text-warn-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V10a.75.75 0 00-1.5 0v2.75zm.75-5a.75.75 0 110 1.5.75.75 0 010-1.5z" clipRule="evenodd" />
      </svg>
      <span className="text-sm text-warn-700 dark:text-warn-300 flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error message" className="text-warn-400 hover:text-warn-600 dark:hover:text-warn-200 text-sm cursor-pointer">✕</button>
      )}
    </div>
  )
}

// ── Success Alert ────────────────────────────────────────────────────────────

export function SuccessAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 px-4 py-3 flex items-start gap-3">
      <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
      <span className="text-sm text-emerald-700 dark:text-emerald-300 flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss success message" className="text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200 text-sm cursor-pointer">✕</button>
      )}
    </div>
  )
}
