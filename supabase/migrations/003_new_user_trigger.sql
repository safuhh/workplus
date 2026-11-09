-- ============================================================
-- Migration 003: Auto-create user_settings on new user signup
--
-- A database trigger inserts a default settings row whenever
-- a new user is created in auth.users. The timezone defaults
-- to 'UTC'; the frontend will update it on first settings save.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (id, timezone, work_target_seconds, break_target_seconds)
  values (new.id, 'UTC', 28800, 3600)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Only the postgres role (service-role) can call security-definer functions from triggers.
-- The trigger fires in the auth schema context, which has service-role permissions.
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

