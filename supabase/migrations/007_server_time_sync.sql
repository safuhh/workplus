-- ============================================================
-- Migration 007: Server time synchronization for persistent time tracking
--
-- Provides get_server_time() returning the database server's actual
-- clock timestamp (UTC) to eliminate local client clock drift.
-- ============================================================

create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select clock_timestamp();
$$;

grant execute on function public.get_server_time() to authenticated, anon;

notify pgrst, 'reload schema';

