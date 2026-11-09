/**
 * App.tsx — root router. Wraps everything in AuthProvider.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '../features/theme/ThemeProvider'
import { AuthProvider } from '../features/auth/AuthContext'
import { AuthGuard } from '../features/auth/AuthGuard'
import { AuthPage } from '../features/auth/AuthPage'
import { AppLayout } from './AppLayout'
import { DashboardPage } from '../features/timer/DashboardPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SetupBanner } from '../components/SetupBanner'
import { isSupabaseConfigured } from '../lib/supabase/client'
import { useSettings } from '../hooks/useSettings'

function AppRoutes() {
  const settingsHook = useSettings()
  const { effectiveSettings } = settingsHook

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route index element={<DashboardPage settings={effectiveSettings} />} />
        <Route path="history" element={<HistoryPage settings={effectiveSettings} />} />
        <Route path="settings" element={<SettingsPage settingsHook={settingsHook} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupBanner />
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

