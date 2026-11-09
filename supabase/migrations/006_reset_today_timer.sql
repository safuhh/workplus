-- ============================================================
-- Migration 006: Add reset_today_timer transactional RPC function
--
-- Safely resets today's work session and all associated time entries
-- for the authenticated user in an atomic transaction, leaving
-- previous days' work history completely untouched.
-- ============================================================

create or replace function public.reset_today_timer(p_timezone text default 'UTC')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_work_date date;
  v_session   public.work_sessions;
  v_tz        text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_deleted   boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  v_work_date := public.local_date_in_tz(v_tz);

  -- 1. If there is an active / paused session for this user, delete it
  select * into v_session
  from public.work_sessions
  where user_id = v_uid
    and status in ('working', 'on_break', 'paused_work', 'paused_break', 'paused')
  for update;

  if found then
    delete from public.work_sessions where id = v_session.id;
    v_deleted := true;
  end if;

  -- 2. Also delete any session specifically matching today's local date
  for v_session in
    select * from public.work_sessions
    where user_id = v_uid
      and work_date = v_work_date
    for update
  loop
    delete from public.work_sessions where id = v_session.id;
    v_deleted := true;
  end loop;

  return jsonb_build_object(
    'success', true,
    'deleted', v_deleted,
    'work_date', v_work_date
  );
end;
$$;

grant execute on function public.reset_today_timer(text) to authenticated;
revoke execute on function public.reset_today_timer(text) from anon;

notify pgrst, 'reload schema';

