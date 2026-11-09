-- ============================================================
-- Migration 005: Fix start_break overloading and handle completed sessions
--
-- 1. Drops the obsolete 0-arg public.start_break() to eliminate PGRST203 overload conflict.
-- 2. Updates start_break(p_timezone text default 'UTC') to gracefully handle existing completed
--    sessions for today without violating uq_work_sessions_user_date (HTTP 409).
-- 3. Updates start_work(p_timezone text default 'UTC') to also gracefully handle existing completed sessions.
-- 4. Notifies PostgREST to reload its schema cache.
-- ============================================================

-- Drop 0-arg overload
drop function if exists public.start_break();

-- Drop and recreate 1-arg start_break with clean defaults
drop function if exists public.start_break(text);

create or replace function public.start_break(p_timezone text default 'UTC')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_work_date date;
  v_session   public.work_sessions;
  v_entry     public.time_entries;
  v_tz        text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  v_work_date := public.local_date_in_tz(v_tz);

  -- 1. Check for currently active / paused session
  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    -- 2. Check if a session already exists for today's local date (e.g. completed earlier today)
    select * into v_session
    from public.work_sessions
    where user_id = v_uid
      and work_date = v_work_date
    order by started_at desc
    limit 1
    for update;

    if found then
      -- Re-open today's session for break
      update public.work_sessions
      set status = 'on_break', ended_at = null, updated_at = now()
      where id = v_session.id
      returning * into v_session;
    else
      -- Create a brand new session for today
      insert into public.work_sessions (user_id, work_date, timezone_snapshot, status, started_at)
      values (v_uid, v_work_date, v_tz, 'on_break', now())
      returning * into v_session;
    end if;
  else
    -- Update existing active session status to on_break
    update public.work_sessions
    set status = 'on_break', updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  -- 3. Close any open entry for this session
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null;

  -- 4. Open the new break interval
  insert into public.time_entries (session_id, user_id, entry_type, started_at)
  values (v_session.id, v_uid, 'break', now())
  returning * into v_entry;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   row_to_json(v_entry)
  );
end;
$$;

grant execute on function public.start_break(text) to authenticated;
revoke execute on function public.start_break(text) from anon;


-- Update start_work to handle completed sessions for today similarly
create or replace function public.start_work(p_timezone text default 'UTC')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_work_date date;
  v_session   public.work_sessions;
  v_entry     public.time_entries;
  v_tz        text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  v_work_date := public.local_date_in_tz(v_tz);

  -- 1. Check for active session
  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    -- 2. Check if today's session already exists (e.g. was completed)
    select * into v_session
    from public.work_sessions
    where user_id = v_uid
      and work_date = v_work_date
    order by started_at desc
    limit 1
    for update;

    if found then
      -- Re-open today's session
      update public.work_sessions
      set status = 'working', ended_at = null, updated_at = now()
      where id = v_session.id
      returning * into v_session;
    else
      -- Create new session for today
      insert into public.work_sessions (user_id, work_date, timezone_snapshot, status, started_at)
      values (v_uid, v_work_date, v_tz, 'working', now())
      returning * into v_session;
    end if;
  else
    -- Update session to working
    update public.work_sessions
    set status = 'working', updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  -- 3. Close any open entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null;

  -- 4. Open new work entry
  insert into public.time_entries (session_id, user_id, entry_type, started_at)
  values (v_session.id, v_uid, 'work', now())
  returning * into v_entry;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   row_to_json(v_entry)
  );
end;
$$;

grant execute on function public.start_work(text) to authenticated;
revoke execute on function public.start_work(text) from anon;


-- Update start_workday alias
create or replace function public.start_workday(p_timezone text default 'UTC')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.start_work(p_timezone);
end;
$$;

grant execute on function public.start_workday(text) to authenticated;
revoke execute on function public.start_workday(text) from anon;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

