/**
 * SetupBanner — displayed when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing.
 * Guides the user through environment setup without crashing, with Dark/Light theme support.
 */

import { AlertTriangle } from 'lucide-react'

export function SetupBanner() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4 transition-colors">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="bg-warn-50 dark:bg-warn-950/60 rounded-xl p-2">
            <AlertTriangle className="h-5 w-5 text-warn-500" />
          </div>
          <h1 className="font-bold text-slate-900 dark:text-white text-lg">Supabase not configured</h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          WorkPulse needs a Supabase project to store your time data securely.
          Follow the steps below to connect one.
        </p>
        <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside">
          <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline">supabase.com</a></li>
          <li>Apply the SQL migrations in <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">supabase/migrations/</code> via the SQL editor or CLI</li>
          <li>Copy <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.env.example</code> → <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.env.local</code></li>
          <li>Fill in <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> from Project Settings → API</li>
          <li>Restart the dev server (<code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">npm run dev</code>)</li>
        </ol>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Never put a service-role key in this file. Only the anon/public key is needed here.
        </p>
      </div>
    </div>
  )
}
