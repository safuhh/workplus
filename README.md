# WorkPulse

A personal daily work-time tracker built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

**Default targets:** 8 hours work · 1 hour breaks · 9-hour planned shift when full break allowance is used.

---

## Features

- Real-time work and break timers derived from persisted Supabase timestamps — never a JS counter
- Separate progress bars for work and break with accurate overrun tracking
- Projected finish time (clearly labelled with its assumption)
- Chronological activity timeline
- Full history by local work date
- Configurable targets and timezone (defaults to your browser timezone)
- Refresh / tab-close / OS-sleep recovery — timestamps persist in Supabase
- Supabase email/password authentication with session restoration
- Row Level Security on every table — users can only access their own data
- Atomic state transitions via PostgreSQL RPC functions

---

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Note your **Project URL** and **anon/public API key** from Project Settings → API.

### 2. Apply Database Migrations

**Option A — Supabase CLI (recommended):**

```bash
# Install Supabase CLI if you don't have it
brew install supabase/tap/supabase

# Link to your project (get project-ref from your Supabase dashboard URL)
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

**Option B — SQL Editor (manual):**

Open the Supabase Dashboard → SQL Editor and run each migration file in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rpc_functions.sql`
3. `supabase/migrations/003_new_user_trigger.sql`

### 3. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Important:** Only the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public/anon key) go here.
> Never put the service-role key in this file or any client-side code.

`.env.local` is already in `.gitignore` via `*.local` — it will not be committed.

### 4. Start the Development Server

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Supabase Auth Setup

No additional Auth configuration is required beyond enabling email/password sign-ups, which is on by default for new Supabase projects.

If you want to require email confirmation, go to Authentication → Email in the Supabase Dashboard.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run typecheck` | TypeScript type check only |
| `npm test` | Run test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Test coverage report |
| `npm run lint` | Lint source files |

---

## Project Structure

```
src/
├── app/                    # Router root, AppLayout
├── components/             # Shared UI atoms (Button, Card, ProgressBar...)
├── domain/
│   └── time-tracking/
│       ├── calculations.ts # Pure duration math — single source of truth
│       ├── queries.ts      # Supabase data access + RPC calls
│       └── __tests__/      # Domain unit tests
├── features/
│   ├── auth/               # AuthContext, AuthGuard, AuthPage
│   ├── timer/              # DashboardPage, ActivityTimeline
│   ├── history/            # HistoryPage
│   └── settings/           # SettingsPage
├── hooks/                  # useWorkday (live session state), useSettings
├── lib/supabase/           # Supabase client singleton
└── types/                  # Shared TypeScript interfaces

supabase/migrations/
├── 001_initial_schema.sql  # Tables, RLS, indexes, constraints
├── 002_rpc_functions.sql   # Atomic state transition RPCs
└── 003_new_user_trigger.sql # Auto-create user_settings on signup
```

---

## Domain Rules (Enforced in DB + Frontend)

- **Work time and break time are always separate.** Break duration never contributes to the work target.
- **State machine:** not_started to working, working to on_break, on_break to working, working/on_break to completed. Invalid transitions are rejected at the database level.
- **At most one active workday per user at a time** (enforced by a partial unique index).
- **At most one open interval per workday** (enforced by a partial unique index).
- **Break tracking never stops at 1 hour.** The UI shows the overrun in orange.
- **Timestamps are timestamptz (UTC).** Local dates and display use the user's configured IANA timezone.
- **Projected finish** = now + remaining work + remaining break allowance. The assumption is always labelled.

---

## Controls & Themes

- **Work Time & Break Time Controls**: Dedicated Start, Pause, Resume, and Stop controls for both sessions, powered by atomic Supabase PostgreSQL RPCs.
- **Dark Mode & Light Mode**: Seamless theme toggle in the header navbar with Sun and Moon icons, persisted via localStorage, OS preference detection, anti-flicker script in head, and full dark palette coverage across all cards, modals, tables, forms, and alerts.

---

## Security

- RLS enabled on all three tables: `user_settings`, `work_sessions`, `time_entries`.
- Every RPC uses `auth.uid()` server-side — the client never supplies a user ID.
- All RPCs are granted to the `authenticated` role only; `anon` cannot call them.
- The service-role key is never present in this codebase.

---

## Known Limitations

- History page shows up to 60 past sessions; pagination is not yet implemented.
- No offline support — the app requires an active Supabase connection for state transitions.
- The Supabase new-user trigger (`003_new_user_trigger.sql`) requires the trigger to be applied to `auth.users`, which may need super-user privileges on the Supabase CLI. If the CLI fails, run it manually in the SQL Editor.
- End-to-end RLS isolation tests require a live Supabase instance and are not included in the Vitest suite (pure domain tests cover all calculation and state-machine logic).

---

## Running Checks (Actual Results)

The following checks were run against the committed code:

```
npm run typecheck   -> 0 errors
npm run lint        -> 0 warnings, 0 errors
npm test            -> 51/51 tests pass (domain calculations + state machine + pause/resume + theme)
npm run build       -> built in ~300ms, 0 errors
```
