-- ============================================================================
-- LOGIN RECOVERY TOOLKIT  (postgres-only admin helpers)
-- ----------------------------------------------------------------------------
-- Why this exists:
--   An institution account created from the company portal showed
--   "Invalid Credentials!" on the school portal login. That error is raised by
--   GoTrue (auth) when the auth row is missing, unconfirmed, or the password
--   hash does not match. These helpers let the owner DIAGNOSE and REPAIR the
--   auth row directly, without any external tooling.
--
-- Execution : MANUAL, by the project owner, in the Supabase SQL Editor.
--             NOT executed by the developer.
-- Safety    : every helper is SECURITY DEFINER owned by postgres and
--             REVOKED from anon/authenticated/public — only the SQL Editor
--             (postgres) can call them. Idempotent / re-runnable.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) DIAGNOSE: show the auth state of one email (safe to run any time)
-- ----------------------------------------------------------------------------
create or replace function public.admin_login_diagnostic(p_email text)
returns table (email text, auth_user_exists boolean, email_confirmed boolean, has_password boolean, users_row_role text, users_row_school text)
language plpgsql stable security definer set search_path = public as $$
declare a auth.users%rowtype; u public.users%rowtype;
begin
  select * into a from auth.users x where lower(x.email) = lower(p_email);
  select * into u from public.users y where lower(y.email) = lower(p_email);
  return query select p_email,
                (a.id is not null),
                (a.email_confirmed_at is not null),
                (a.encrypted_password is not null and a.encrypted_password <> ''),
                u.role, u."schoolId";
end $$;

-- ----------------------------------------------------------------------------
-- 2) RECOVER: confirm the email and/or (re)set the password of an auth user;
--    if the auth row is missing entirely, create it (GoTrue-compatible hash).
-- ----------------------------------------------------------------------------
create or replace function public.admin_recover_login(p_email text, p_new_password text default null)
returns table (email text, action_taken text, confirmed boolean, password_set boolean)
language plpgsql security definer set search_path = public as $$
declare a auth.users%rowtype; act text := 'none'; pw_set boolean := false;
begin
  select * into a from auth.users x where lower(x.email) = lower(p_email);

  if a.id is null then
    if p_new_password is null or p_new_password = '' then
      return query select p_email, 'auth user missing - provide a password to create', false, false;
      return;
    end if;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      lower(p_email), crypt(p_new_password, gen_salt('bf')),
      now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
    act := 'auth user created';
    pw_set := true;
  else
    if a.email_confirmed_at is null or a.confirmed_at is null then
      update auth.users
         set email_confirmed_at = coalesce(email_confirmed_at, now()),
             confirmed_at       = coalesce(confirmed_at, now()),
             updated_at         = now()
       where id = a.id;
      act := 'email confirmed';
    end if;
    if p_new_password is not null and p_new_password <> '' then
      update auth.users
         set encrypted_password = crypt(p_new_password, gen_salt('bf')),
             updated_at         = now()
       where id = a.id;
      pw_set := true;
      act := case when act = 'none' then 'password reset' else act || ' + password reset' end;
    end if;
    if act = 'none' then act := 'already ok (pass a new password to reset)'; end if;
  end if;

  return query select p_email, act, true, pw_set;
end $$;

-- Owner-only: the SQL Editor runs as postgres; app roles must NEVER see these.
revoke all on function public.admin_login_diagnostic(text) from public, anon, authenticated;
revoke all on function public.admin_recover_login(text, text) from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- HOW TO USE (after running this file once):
--
--   Step 1 - diagnose:
--     select * from public.admin_login_diagnostic('bcakupwara001@gmail.com');
--   Step 2 - recover (sets/creates password AND confirms email):
--     select * from public.admin_recover_login('bcakupwara001@gmail.com', 'NewStrongPass@123');
--   Step 3 - login on the portal with that exact email + password.
-- ============================================================================
