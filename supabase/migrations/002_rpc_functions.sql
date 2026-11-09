-- ============================================================
-- Migration 002: Atomic state-transition RPC functions
--
-- These functions run in a single transaction, validate
-- auth.uid() server-side, enforce state-machine rules, and
-- return a JSON payload with the updated session and entry.
--
-- Functions: start_workday, start_break, resume_work, finish_workday
--
-- Security: SECURITY INVOKER (runs as the authenticated caller).
-- search_path is set to '' and objects are fully schema-qualified
-- to prevent search_path injection.
-- ============================================================

-- ── Helper: get the current local date in a timezone ─────────────────────────
-- Used to populate work_date when starting a workday.
create or replace function public.local_date_in_tz(p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p_tz)::date;
$$;

grant execute on function public.local_date_in_tz(text) to authenticated;


-- ── start_workday ─────────────────────────────────────────────────────────────
-- Creates a new work_session and its first work time_entry for today.
-- Fails if the user already has an active session.

create or replace function public.start_workday(p_timezone text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_work_date  date;
  v_session    public.work_sessions;
  v_entry      public.time_entries;
begin
  -- Reject unauthenticated requests
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  -- Determine local work date
  v_work_date := public.local_date_in_tz(p_timezone);

  -- Prevent two active sessions
  if exists (
    select 1 from public.work_sessions
    where user_id = v_uid
      and status in ('working', 'on_break')
  ) then
    raise exception 'A workday is already active' using errcode = 'P0002';
  end if;

  -- Create the work session
  insert into public.work_sessions (user_id, work_date, timezone_snapshot, status, started_at)
  values (v_uid, v_work_date, p_timezone, 'working', now())
  returning * into v_session;

  -- Open the first work interval
  insert into public.time_entries (session_id, user_id, entry_type, started_at)
  values (v_session.id, v_uid, 'work', now())
  returning * into v_entry;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   row_to_json(v_entry)
  );
end;
$$;

grant execute on function public.start_workday(text) to authenticated;
revoke execute on function public.start_workday(text) from anon;


-- ── start_break ──────────────────────────────────────────────────────────────
-- Closes the open work entry → opens a break entry → updates session status.

create or replace function public.start_break()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.work_sessions;
  v_entry   public.time_entries;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  -- Lock and fetch the active session
  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status <> 'working' then
    raise exception 'Can only start a break while working (current: %)', v_session.status
      using errcode = 'P0004';
  end if;

  -- Close the open work entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null
    and entry_type = 'work';

  -- Open a break entry
  insert into public.time_entries (session_id, user_id, entry_type, started_at)
  values (v_session.id, v_uid, 'break', now())
  returning * into v_entry;

  -- Update session status
  update public.work_sessions
  set status = 'on_break', updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   row_to_json(v_entry)
  );
end;
$$;

grant execute on function public.start_break() to authenticated;
revoke execute on function public.start_break() from anon;


-- ── resume_work ───────────────────────────────────────────────────────────────
-- Closes the open break entry → opens a work entry → updates session status.

create or replace function public.resume_work()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.work_sessions;
  v_entry   public.time_entries;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status <> 'on_break' then
    raise exception 'Can only resume work while on break (current: %)', v_session.status
      using errcode = 'P0005';
  end if;

  -- Close the open break entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null
    and entry_type = 'break';

  -- Open a work entry
  insert into public.time_entries (session_id, user_id, entry_type, started_at)
  values (v_session.id, v_uid, 'work', now())
  returning * into v_entry;

  -- Update session status
  update public.work_sessions
  set status = 'working', updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   row_to_json(v_entry)
  );
end;
$$;

grant execute on function public.resume_work() to authenticated;
revoke execute on function public.resume_work() from anon;


-- ── finish_workday ────────────────────────────────────────────────────────────
-- Closes the open entry (work or break) → marks session completed.

create or replace function public.finish_workday()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.work_sessions;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  -- Close whichever interval is open
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null;

  -- Complete the session
  update public.work_sessions
  set status = 'completed', ended_at = now(), updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   null
  );
end;
$$;

grant execute on function public.finish_workday() to authenticated;
revoke execute on function public.finish_workday() from anon;

