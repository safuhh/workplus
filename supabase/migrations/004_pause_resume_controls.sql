-- ============================================================
-- Migration 004: Add Pause, Resume, and Stop controls for
-- both Work sessions and Break sessions.
--
-- Adds support for paused states ('paused_work', 'paused_break', 'paused')
-- and transactional RPC functions:
--   - pause_work()
--   - resume_work()
--   - stop_work()
--   - start_work(p_timezone text)
--   - start_break(p_timezone text default null)
--   - pause_break()
--   - resume_break()
--   - stop_break()
--
-- Security: SECURITY INVOKER with search_path = '' and fully qualified objects.
-- Derives acting user from auth.uid().
-- ============================================================

-- 1. Update work_sessions status check constraint
alter table public.work_sessions
  drop constraint if exists work_sessions_status_check;

alter table public.work_sessions
  add constraint work_sessions_status_check
  check (status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused', 'completed'));

-- 2. Update active session partial unique index to include paused states
drop index if exists public.uq_work_sessions_active_per_user;

create unique index uq_work_sessions_active_per_user
  on public.work_sessions (user_id)
  where status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused');

-- ── 3. RPC: start_work ────────────────────────────────────────────────────────
create or replace function public.start_work(p_timezone text)
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
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  v_work_date := public.local_date_in_tz(p_timezone);

  -- Check for existing active session
  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if found then
    -- Close any open entry
    update public.time_entries
    set ended_at = now()
    where session_id = v_session.id
      and ended_at is null;

    -- Update session to working
    update public.work_sessions
    set status = 'working', updated_at = now()
    where id = v_session.id
    returning * into v_session;
  else
    -- Create new session for today
    insert into public.work_sessions (user_id, work_date, timezone_snapshot, status, started_at)
    values (v_uid, v_work_date, p_timezone, 'working', now())
    returning * into v_session;
  end if;

  -- Open a work entry
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

-- Keep start_workday as alias
create or replace function public.start_workday(p_timezone text)
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


-- ── 4. RPC: pause_work ────────────────────────────────────────────────────────
create or replace function public.pause_work()
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status <> 'working' then
    raise exception 'Can only pause work while working (current: %)', v_session.status
      using errcode = 'P0004';
  end if;

  -- Close open work entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null
    and entry_type = 'work';

  -- Update session status to paused_work
  update public.work_sessions
  set status = 'paused_work', updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   null
  );
end;
$$;

grant execute on function public.pause_work() to authenticated;
revoke execute on function public.pause_work() from anon;


-- ── 5. RPC: resume_work ───────────────────────────────────────────────────────
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status = 'working' then
    raise exception 'Work is already running' using errcode = 'P0005';
  end if;

  -- Close any open entry (e.g. if switching from on_break)
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null;

  -- Open new work entry
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


-- ── 6. RPC: stop_work ─────────────────────────────────────────────────────────
create or replace function public.stop_work()
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  -- Close any open entry
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

grant execute on function public.stop_work() to authenticated;
revoke execute on function public.stop_work() from anon;

-- finish_workday alias
create or replace function public.finish_workday()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.stop_work();
end;
$$;

grant execute on function public.finish_workday() to authenticated;
revoke execute on function public.finish_workday() from anon;


-- ── 7. RPC: start_break ───────────────────────────────────────────────────────
create or replace function public.start_break(p_timezone text default null)
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
  v_tz        text := coalesce(p_timezone, 'UTC');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    -- Allow starting break as the first session of the day
    v_work_date := public.local_date_in_tz(v_tz);
    insert into public.work_sessions (user_id, work_date, timezone_snapshot, status, started_at)
    values (v_uid, v_work_date, v_tz, 'on_break', now())
    returning * into v_session;
  else
    -- Close any open work entry
    update public.time_entries
    set ended_at = now()
    where session_id = v_session.id
      and ended_at is null;

    update public.work_sessions
    set status = 'on_break', updated_at = now()
    where id = v_session.id
    returning * into v_session;
  end if;

  -- Open break entry
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


-- ── 8. RPC: pause_break ───────────────────────────────────────────────────────
create or replace function public.pause_break()
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status <> 'on_break' then
    raise exception 'Can only pause break while on break (current: %)', v_session.status
      using errcode = 'P0006';
  end if;

  -- Close open break entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null
    and entry_type = 'break';

  -- Update session status
  update public.work_sessions
  set status = 'paused_break', updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   null
  );
end;
$$;

grant execute on function public.pause_break() to authenticated;
revoke execute on function public.pause_break() from anon;


-- ── 9. RPC: resume_break ──────────────────────────────────────────────────────
create or replace function public.resume_break()
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  if v_session.status = 'on_break' then
    raise exception 'Break is already running' using errcode = 'P0007';
  end if;

  -- Close any open entry
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null;

  -- Open break entry
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

grant execute on function public.resume_break() to authenticated;
revoke execute on function public.resume_break() from anon;


-- ── 10. RPC: stop_break ───────────────────────────────────────────────────────
create or replace function public.stop_break()
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
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if not found then
    raise exception 'No active workday found' using errcode = 'P0003';
  end if;

  -- Close open break entry if any
  update public.time_entries
  set ended_at = now()
  where session_id = v_session.id
    and ended_at is null
    and entry_type = 'break';

  -- Set session back to paused_work (ready to resume work or finish)
  update public.work_sessions
  set status = 'paused_work', updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'session', row_to_json(v_session),
    'entry',   null
  );
end;
$$;

grant execute on function public.stop_break() to authenticated;
revoke execute on function public.stop_break() from anon;

