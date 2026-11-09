AGENTS.md — WorkPulse
1. Project mission
Build WorkPulse, a personal daily work-time tracker. Its core purpose is to make it obvious how much time the user has actually worked, how much break time has been used, and how much time remains toward the daily targets.

The default daily targets are:
- 8 hours of actual work (28,800 seconds).
- 1 hour of break time (3,600 seconds).
- 9 hours of planned shift time only when the full 1-hour break allowance is used.
Work time and break time are separate totals. Never treat 9 hours as 9 hours of productive work. The default targets may be editable in Settings, but changing a target must not rewrite historical time entries.

This is a single-user personal productivity application, not an employee-management, payroll, attendance, surveillance, or team-management platform.
2. Required technology
- Frontend: React + TypeScript + Vite.
- Styling: Tailwind CSS. Use the existing styling system if the repository already has one; do not replace it without a reason.
- Backend and persistence: Supabase (PostgreSQL + Supabase Auth + Row Level Security).
- Supabase JavaScript client: @supabase/supabase-js.
- Icons: lucide-react if an icon package is needed.
- Tests: Vitest and React Testing Library for frontend logic and components. Add database/RLS tests where the project tooling supports them.
Do not add a separate Express, NestJS, Laravel, Firebase, or custom API server. Supabase is the backend for this project.
3. Core user experience
Main dashboard
The dashboard should answer these questions immediately:
1. Am I currently working, on a break, or finished for today?
2. How much actual work time have I completed out of 8 hours?
3. How much break time have I used out of 1 hour?
4. How much work time remains?
5. How much break allowance remains, or by how much has it been exceeded?
6. What is my projected finish time, with its assumptions clearly explained?
Show:
- A prominent live timer for the current state.
- Work progress and break progress as separate progress indicators.
- Remaining work duration.
- Remaining break allowance / break overrun.
- Start Workday, Start Break, Resume Work, and Finish Workday controls appropriate to the current state.
- A chronological timeline of today's work and break intervals.
- A clear loading state, empty state, confirmation for finishing the day, and actionable error messages.
History
Provide a simple history view grouped by the user's local work date. Each day should show total work time, total break time, whether the work target was reached, and the interval timeline. Do not fabricate historical entries or sample production data.
Authentication
Use Supabase email/password authentication unless the repository already has a deliberate, documented authentication choice. Include sign-up, sign-in, sign-out, session restoration, protected application routes, and friendly auth errors. Never implement a fake client-only authentication flow.
Settings
Provide defaults of 8 hours work, 1 hour breaks, and the user's IANA time zone (normally detected from the browser, with an editable setting). Validate targets as positive durations. A target change applies to future calculations and must not alter stored intervals.
4. Time-tracking domain rules — source of truth
Use these rules consistently in the database, domain logic, UI, and tests.
Workday state machine
The allowed states are:
- not_started: no active workday exists.
- working: the active interval is a work interval.
- on_break: the active interval is a break interval.
- completed: the workday has been explicitly finished.
Allowed transitions:
- not_started → working by Start Workday.
- working → on_break by Start Break.
- on_break → working by Resume Work.
- working → completed by Finish Workday.
- on_break → completed by Finish Workday (close the break interval and finish the workday).
Reject invalid transitions with a useful message. Prevent two active workdays for the same user. Prevent two simultaneously open intervals within one workday.
Interval model
- Starting a workday creates a workday record and its first open work interval.
- Starting a break closes the current open work interval and creates an open break interval.
- Resuming work closes the open break interval and creates an open work interval.
- Finishing the day closes whichever interval is open and marks the workday completed.
- Every interval has a started_at timestamp and an optional ended_at timestamp.
- A null ended_at means that interval is currently running; there must be at most one such interval per workday.
- Total work and break durations are the sums of their respective intervals. For an open interval, calculate its current duration from its start timestamp to the current time.
- Never store a counter that increments every second as the source of truth.
Clock and refresh behavior
- Persist timestamps in PostgreSQL timestamptz (UTC instants); do not store a formatted clock string as the source of truth.
- Use database/server time for state-changing transitions where possible. Do not trust a user-editable browser clock as the authoritative transition timestamp.
- Use the configured IANA time zone to determine the local work_date and render date/time values.
- The UI may update a displayed timer every second, but that interval is presentation only. Clear it when components unmount.
- After a refresh, browser restart, or device sleep, reload the open interval from Supabase and calculate elapsed time from its persisted timestamp. Do not reset or silently pause an active interval when a tab closes or becomes hidden.
- Handle workdays that cross midnight: retain the original workday's local date and do not split or duplicate its intervals automatically.
- Handle daylight-saving transitions correctly by calculating elapsed duration from timestamps, not by subtracting local clock strings.
Calculations
- workSeconds = sum(completed work interval durations) + elapsed seconds of the open work interval, if any.
- breakSeconds = sum(completed break interval durations) + elapsed seconds of the open break interval, if any.
- remainingWorkSeconds = max(0, workTargetSeconds - workSeconds).
- remainingBreakSeconds = max(0, breakTargetSeconds - breakSeconds).
- breakOverrunSeconds = max(0, breakSeconds - breakTargetSeconds).
- Progress bars must be visually capped at 100%, while numeric totals may exceed the target.
- Do not stop the break timer when the 1-hour allowance is reached. Show the overrun and keep tracking accurately.
- The work target is complete only when actual work duration reaches the configured work target. Break duration must never count as work.
- If showing a projected finish time, label the assumption: now + remaining work + remaining break allowance, assuming the user uses all remaining break allowance. Do not imply this is a guaranteed finish time.
- Use integer seconds (or another clearly defined smallest unit) internally. Format durations only at the presentation boundary.
Recovery and concurrency
- Refresh/reopen recovery is mandatory.
- Prevent rapid repeated clicks from creating duplicate transitions; disable relevant controls while a transition is pending and enforce state validity in the database as well.
- Prefer transactional Supabase Postgres RPC functions for state transitions so closing one interval, opening the next interval, and changing the workday state succeed or fail together.
- RPCs must derive the acting user from auth.uid(), reject unauthenticated requests, validate ownership and current state, and be executable only by the intended authenticated role. If using SECURITY DEFINER, set a safe search_path, fully qualify objects, and explicitly validate authorization. Never rely on the frontend alone for authorization or state correctness.
- Handle concurrent requests safely. A database constraint/transaction/row lock must prevent duplicate active workdays or intervals.
5. Supabase data and security requirements
Use SQL migrations committed to the repository (for example, supabase/migrations/). Do not rely on undocumented manual dashboard changes as the only schema setup.

A reasonable initial schema is:
- user_settings: one row per authenticated user; time zone and work/break target seconds.
- work_sessions: user ID, local work date, time zone snapshot, start/end timestamps, status, audit timestamps.
- time_entries: work-session ID, user ID, entry type (work or break), start/end timestamps, audit timestamps.
You may adjust names or columns after inspecting an existing schema, but record the reason and preserve all domain invariants above.

Security requirements:
- Enable Row Level Security on every exposed application table.
- Every user-owned row must be scoped to auth.uid() through tested RLS policies.
- Review table grants as well as RLS policies. A policy does not revoke broad table privileges by itself.
- Do not expose the Supabase service-role key or any secret in frontend code, browser bundles, commits, screenshots, or logs.
- Frontend environment variables may contain only the Supabase project URL and publishable/anon key. Treat these as public identifiers protected by RLS, not as secrets.
- Validate all user input and database transition arguments.
- Never accept a user ID supplied by the browser as proof of identity.
- Add indexes for common lookups (user ID, work date, work-session ID) and constraints/partial unique indexes for active-state invariants where appropriate.
- Provide .env.example with placeholder values only. Keep .env, .env.local, and real credentials out of version control.
- Never ask the user to paste a service-role key into chat or source files.
6. Architecture and code quality
- Keep UI components, page composition, domain calculations, Supabase data access, and authentication concerns separate.
- Put time calculation and state transition validation in small pure domain functions wherever possible. Do not duplicate formulas across components.
- Use TypeScript types for domain entities and Supabase responses. Prefer generated Supabase database types when feasible; do not invent database fields that are not in the migrations/schema.
- Keep components focused and reusable. Avoid giant single-file components.
- Use clear names such as workSeconds, breakSeconds, remainingWorkSeconds, and breakOverrunSeconds.
- Avoid unnecessary state management libraries. Use React state/context or the existing state solution unless there is a demonstrated need for more.
- Avoid unnecessary dependencies and abstractions.
- Never swallow errors. Show a useful UI error and preserve the user's existing persisted data.
- Use semantic HTML, keyboard-accessible controls, visible focus states, labels, and sufficient contrast.
- Support desktop and mobile layouts.
- Keep date/time formatting locale-aware and time-zone-aware.
Suggested organization (adapt to the existing repo instead of forcing this layout):
src/
  app/
  components/
  features/
    auth/
    timer/
    history/
    settings/
  hooks/
  lib/
    supabase/
  domain/
    time-tracking/
  types/
  pages/
supabase/
  migrations/
7. Anti-hallucination and tool-use rules
These rules are mandatory:
1. Inspect the actual repository, package files, source files, and existing migrations before proposing edits. Do not assume the project is empty or uses a particular library/version.
2. Treat the checked-in code, migrations, tests, and official documentation as evidence. Do not invent APIs, package names, environment variables, database columns, RPC names, or file paths.
3. When unsure about a current React, Vite, Supabase, Tailwind, or Antigravity API, consult the official documentation for the installed version before coding. Prefer official Supabase and Google Antigravity documentation over blogs or memory.
4. If documentation cannot be accessed, clearly state the uncertainty and implement only a pattern supported by the installed dependency types and current repository code.
5. Do not claim that a feature, migration, test, build, deployment, or integration works unless you actually ran the relevant verification and observed success.
6. Never fabricate test output, screenshots, URLs, Supabase project IDs, credentials, database contents, or deployment status.
7. Do not replace working project code or configuration wholesale without first understanding it. Keep changes minimal and explain any necessary breaking change.
8. Never silently change the product requirements in this file. If a genuine conflict exists, explain it and choose the safest behavior; ask the user only when a decision blocks implementation.
9. Do not create fake/mock production data to make the dashboard appear populated. If demo data is needed for development, keep it explicit, isolated, and out of real user history.
10. Do not use localStorage/sessionStorage as the authoritative timer or work-history database. Supabase is the persisted source of truth. Local storage may be used only for harmless UI preferences if needed.
11. Do not introduce polling that writes to the database every second. Timer display updates are local; state transitions are persisted only when the user changes state.
12. Do not write destructive SQL, drop tables, truncate data, reset a remote Supabase project, or apply migrations to a production project without explicit user authorization.
8. Required tests and acceptance criteria
At minimum, test the pure calculations and transition behavior for:
- No session started.
- Work interval currently running.
- Break interval currently running.
- Multiple work/break intervals in one workday.
- Work target reached exactly and exceeded.
- Break target reached exactly and exceeded.
- A break crossing the 1-hour target without stopping.
- Refresh/reload recovery using a persisted open interval.
- A workday crossing midnight.
- Daylight-saving/time-zone-safe elapsed calculations.
- Finish Workday while working and while on break.
- Invalid transitions and double-click/concurrent transition protection.
- User A cannot read or mutate User B's data.
Before calling the project complete, run the available lint, type-check, tests, and production build. Report exactly which commands were run and their actual outcomes. If a check cannot run, state why.
9. Scope control
MVP includes:
- Authentication.
- Start/stop workday and start/resume breaks.
- Live dashboard and separate work/break totals.
- Work/break progress and remaining durations.
- Activity timeline.
- Daily history.
- User targets/time-zone settings.
- Supabase schema, migrations, RLS, and safe state transitions.
- Tests and setup documentation.
Do not add teams, payroll, screenshots, employee monitoring, GPS, automatic activity detection, task/project billing, AI chat, calendar integrations, subscriptions, or analytics trackers unless the user explicitly requests them later.
10. Completion report
At the end of a task, provide:
- What was implemented.
- Important files created/changed.
- Database migration and Supabase setup steps still required.
- Environment variables required (names only; never values).
- Commands/tests/build checks run with real results.
- Known limitations or unfinished work.
- The next single recommended implementation step.