# WorkPulse — Implementation Plan

> Generated: Phase 0 audit. Last updated: Phase 0.

---

## 1. Repository Audit Summary

| Item | Finding |
|------|---------|
| Existing code | **None** — only `AGENTS.md` present |
| Framework | To be scaffolded: React + TypeScript + Vite |
| Package manager | npm (v11), Node v24 |
| Supabase credentials | **Not yet configured** — `.env.local` must be created by the user |
| Existing migrations | **None** |
| Existing tests | **None** |
| Existing styling | **None** — will use Tailwind CSS |

---

## 2. Architecture Overview

```
app_timer/
├── supabase/
│   └── migrations/           # SQL migration files (committed)
├── src/
│   ├── app/
│   │   └── App.tsx           # Router root, session bootstrap
│   ├── components/           # Shared UI atoms (Button, Progress, Badge…)
│   ├── features/
│   │   ├── auth/             # SignIn, SignUp, AuthGuard
│   │   ├── timer/            # Dashboard, Timer, Timeline, Controls
│   │   ├── history/          # HistoryPage, DayCard
│   │   └── settings/         # SettingsPage, SettingsForm
│   ├── hooks/                # useSession, useWorkday, useSettings, useLiveTick
│   ├── lib/
│   │   └── supabase/         # supabase client + generated types
│   ├── domain/
│   │   └── time-tracking/    # Pure calculation + state machine functions
│   └── types/                # Shared TypeScript interfaces
├── .env.example
├── .gitignore
├── implementation_plan.md
├── README.md
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Data Model

### `user_settings`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.uid() |
| timezone | text | IANA tz string, default = 'UTC' |
| work_target_seconds | integer | default 28800 (8h) |
| break_target_seconds | integer | default 3600 (1h) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `work_sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid FK | → auth.users |
| work_date | date | local date in user's tz |
| timezone_snapshot | text | tz at session start |
| status | text | not_started / working / on_break / completed |
| started_at | timestamptz | |
| ended_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Constraints:**
- `UNIQUE (user_id, work_date)` — one session per user per local date
- Partial unique index: `(user_id) WHERE status IN ('working','on_break')` — at most one active session

### `time_entries`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | gen_random_uuid() |
| session_id | uuid FK | → work_sessions |
| user_id | uuid FK | → auth.users |
| entry_type | text | 'work' or 'break' |
| started_at | timestamptz | |
| ended_at | timestamptz | nullable |
| created_at | timestamptz | |

**Constraints:**
- Partial unique index: `(session_id) WHERE ended_at IS NULL` — at most one open interval per session

---

## 4. Workday State Machine

```
not_started ──[Start Workday]──► working
working     ──[Start Break]────► on_break
on_break    ──[Resume Work]────► working
working     ──[Finish Workday]─► completed
on_break    ──[Finish Workday]─► completed   (closes break first)
```

All invalid transitions are rejected at the database level by RPC functions.

---

## 5. PostgreSQL RPC Functions

| Function | Action |
|----------|--------|
| `start_workday(p_timezone text)` | Creates work_session + first time_entry (work) |
| `start_break()` | Closes open work entry → opens break entry |
| `resume_work()` | Closes open break entry → opens work entry |
| `finish_workday()` | Closes open entry → sets session.status = completed |

Each RPC:
- Uses `auth.uid()` for identity — never trusts a client-supplied user_id
- Runs in a single transaction
- Validates current status before mutating
- Returns the updated session + open entry (or null)
- Is callable by `authenticated` role only

---

## 6. Time Calculation Rules (Domain Functions)

```
workSeconds = Σ(completed work entries duration) + elapsed(open work entry if any)
breakSeconds = Σ(completed break entries duration) + elapsed(open break entry if any)
elapsed(entry) = nowUTC - entry.started_at   // in seconds, never negative

remainingWorkSeconds  = max(0, workTarget - workSeconds)
remainingBreakSeconds = max(0, breakTarget - breakSeconds)
breakOverrunSeconds   = max(0, breakSeconds - breakTarget)

projectedFinishSecs   = now + remainingWorkSeconds + remainingBreakSeconds
  // label: "Assuming you use all remaining break allowance"
```

Progress bars: `min(100, (actual / target) * 100)` — capped visually, full numeric shown.

---

## 7. Frontend State & Refresh Recovery

- On app load: fetch `active work_session` (status = working | on_break) + its `time_entries`.
- Reconstruct elapsed time from `entry.started_at` vs `Date.now()`.
- `useLiveTick` hook: `setInterval(1s)` updates display only. Clears on unmount.
- No `localStorage` as source of truth; Supabase is canonical.
- `Page Visibility API`: on `visibilitychange` → `visible`, re-fetch the session to resync after sleep/suspend.

---

## 8. Environment Variables

```
VITE_SUPABASE_URL=        # your project URL (public, safe in client)
VITE_SUPABASE_ANON_KEY=   # publishable anon key (public, safe in client)
```

No service-role key ever touches the frontend.

---

## 9. Security Checklist

- [x] RLS on `user_settings`, `work_sessions`, `time_entries`
- [x] Policies: `user_id = auth.uid()` on every row
- [x] Grants: SELECT/INSERT/UPDATE/DELETE to `authenticated` only (no `anon` write grants)
- [x] RPC functions validate `auth.uid()` server-side
- [x] No service-role key in client code
- [x] `.env.local` in `.gitignore`

---

## 10. Build Phases & File Plan

### Phase 1 — Foundation & UI Shell
- Scaffold Vite + React + TS project
- Install: `tailwindcss`, `lucide-react`, `react-router-dom`, `@supabase/supabase-js`
- Set up `tailwind.config.ts`, design tokens (color palette, font)
- Layout component with nav (Dashboard | History | Settings | Sign Out)
- Auth pages (SignIn, SignUp) — form UI only, no Supabase yet
- Dashboard shell with mock states (not_started / working / on_break / completed)
- Run: `tsc --noEmit` + `vite build`

### Phase 2 — Supabase Client & Auth
- `src/lib/supabase/client.ts` with env-variable validation
- `AuthContext` + `useSession` hook
- Protected route wrapper
- `AuthGuard`, route-level redirects
- `.env.example`, verify `.gitignore`
- Run: type-check + build

### Phase 3 — Database Schema & Security
- `supabase/migrations/001_initial_schema.sql`
  - Tables, constraints, indexes, RLS, grants
- `supabase/migrations/002_rpc_functions.sql`
  - `start_workday`, `start_break`, `resume_work`, `finish_workday`
- `supabase/migrations/003_default_settings_trigger.sql`
  - Auto-create `user_settings` row on new user
- README instructions for `supabase db push` / manual apply

### Phase 4 — Domain Logic & Persistence
- `src/domain/time-tracking/calculations.ts` — pure functions
- `src/domain/time-tracking/transitions.ts` — Supabase RPC calls
- `src/domain/time-tracking/queries.ts` — fetch sessions, history, settings
- `src/hooks/useWorkday.ts` — active session state + live tick
- `src/hooks/useSettings.ts`
- Visibility-change resync

### Phase 5 — Connected Dashboard, History, Settings
- Wire `useWorkday` into Dashboard components
- Live timer display, progress bars, timeline, projected finish
- History page: grouped by work_date, interval timelines
- Settings page: edit targets + timezone, persist to `user_settings`
- Error / empty / loading states throughout

### Phase 6 — Tests, Lint, Final Docs
- Vitest unit tests for all domain calculation + state machine functions
- Component tests (React Testing Library) for key UI states
- Lint: `eslint`
- Type-check: `tsc --noEmit`
- Build: `vite build`
- README: complete setup + migration instructions
- Final acceptance checklist verification

---

## 11. Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| No Supabase credentials yet | Build entire app; use env-var guard to show setup message instead of crashing |
| Midnight-crossing workday | Store `work_date` as the local date at session start; never re-derive from UTC |
| DST transitions | Calculate elapsed time from timestamptz instants (not local strings) |
| Double-click / duplicate transitions | Disable button while request in-flight; DB partial unique index enforces invariant |
| Tab sleep / OS suspend | `Page Visibility API` triggers re-fetch on wake; persisted timestamps remain correct |

---

## 12. Acceptance Checklist (Pre-completion Gate)

- [ ] User can sign up, sign in, sign out
- [ ] Starting a workday creates a persisted work interval
- [ ] Start Break closes work + opens break atomically
- [ ] Resume Work closes break + opens work atomically
- [ ] Multiple breaks counted correctly in one workday
- [ ] Finish Workday closes open interval + completes session
- [ ] Work time never includes break time
- [ ] Break continues beyond 1h and shows overrun
- [ ] Work target based only on actual work time
- [ ] Refresh / reopen / sleep recovery uses persisted timestamps
- [ ] Daily history is real Supabase data
- [ ] User settings persist; no historical rewrite
- [ ] RLS prevents cross-user access
- [ ] No service-role key in client code
- [ ] Core domain/transition tests pass
- [ ] Lint / type-check / tests / build reported honestly

