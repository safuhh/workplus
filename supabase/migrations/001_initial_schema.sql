-- ============================================================
-- Migration 001: Initial schema for WorkPulse
-- Tables: user_settings, work_sessions, time_entries
-- Includes: RLS policies, grants, indexes, constraints
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── user_settings ────────────────────────────────────────────────────────────
-- One row per authenticated user. PK = auth.uid().
create table public.user_settings (
  id                   uuid primary key references auth.users(id) on delete cascade,
  timezone             text not null default 'UTC',
  work_target_seconds  integer not null default 28800 check (work_target_seconds > 0),
  break_target_seconds integer not null default 3600  check (break_target_seconds >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Only the owning user may read or write their own settings row.
create policy "users: select own settings"
  on public.user_settings for select
  using (id = auth.uid());

create policy "users: insert own settings"
  on public.user_settings for insert
  with check (id = auth.uid());

create policy "users: update own settings"
  on public.user_settings for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users: delete own settings"
  on public.user_settings for delete
  using (id = auth.uid());

-- Revoke broad grants; allow only the authenticated role.
revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;


-- ── work_sessions ────────────────────────────────────────────────────────────
-- One workday record per user per local calendar date.

create table public.work_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  work_date          date not null,
  timezone_snapshot  text not null,
  status             text not null default 'working'
                       check (status in ('working', 'on_break', 'completed')),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One session per user per local date
  constraint uq_work_sessions_user_date unique (user_id, work_date)
);

-- At most one active (working or on_break) session per user at a time.
create unique index uq_work_sessions_active_per_user
  on public.work_sessions (user_id)
  where status in ('working', 'on_break');

-- Common lookup indexes
create index idx_work_sessions_user_id  on public.work_sessions (user_id);
create index idx_work_sessions_work_date on public.work_sessions (user_id, work_date desc);

alter table public.work_sessions enable row level security;

create policy "users: select own sessions"
  on public.work_sessions for select
  using (user_id = auth.uid());

create policy "users: insert own sessions"
  on public.work_sessions for insert
  with check (user_id = auth.uid());

create policy "users: update own sessions"
  on public.work_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users: delete own sessions"
  on public.work_sessions for delete
  using (user_id = auth.uid());

revoke all on public.work_sessions from anon;
grant select, insert, update, delete on public.work_sessions to authenticated;


-- ── time_entries ─────────────────────────────────────────────────────────────
-- Individual work/break intervals within a workday session.

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.work_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  entry_type  text not null check (entry_type in ('work', 'break')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now()
);

-- At most one open (ended_at IS NULL) interval per session.
create unique index uq_time_entries_open_per_session
  on public.time_entries (session_id)
  where ended_at is null;

create index idx_time_entries_session_id on public.time_entries (session_id);
create index idx_time_entries_user_id    on public.time_entries (user_id);

alter table public.time_entries enable row level security;

create policy "users: select own entries"
  on public.time_entries for select
  using (user_id = auth.uid());

create policy "users: insert own entries"
  on public.time_entries for insert
  with check (user_id = auth.uid());

create policy "users: update own entries"
  on public.time_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users: delete own entries"
  on public.time_entries for delete
  using (user_id = auth.uid());

revoke all on public.time_entries from anon;
grant select, insert, update, delete on public.time_entries to authenticated;

