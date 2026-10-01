-- ============================================================================
-- COREEDU.IN  •  Staff portal RLS + attendance_records hardening
-- ----------------------------------------------------------------------------
-- Run in: Supabase Dashboard → SQL Editor (executes as `postgres`).
-- Idempotent: safe to re-run. Every policy this file owns is dropped first;
-- existing policies owned by earlier migrations are left untouched except on
-- public.attendance_records (see section 6 - that table is rebuilt on purpose).
--
-- Why this file exists:
--   1. Chairman-created staff/HOD IDs were failing because `public.users`
--      writes from the chairman session had no permissive policy path.
--   2. The new staff portal (dashboard/attendance/marks/homework/notices/
--      leave) needs school-scoped staff read/write policies.
--   3. Owner-confirmed hardening: public.attendance_records still had broad
--      authenticated table grants + an ALL policy whose WITH CHECK needed
--      final hardening.
--
-- Identity model used below:
--   * Chairman/staff = GoTrue session; their row lives in public.users
--     (role = 'chairman' | 'staff', "schoolId" = school).
--   * Student = Render-issued JWT; identity comes from the existing
--     SECURITY DEFINER helpers current_user_student_id()/current_user_school_id().
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Stable session context helper (SECURITY DEFINER so it can be used inside
--    policies on public.users itself without RLS recursion). Returns NULL row
--    for sessions that have no users row (e.g. student JWTs) → policies deny.
-- ----------------------------------------------------------------------------
create or replace function public.portal_user_context()
returns table(role text, school_id text)
language sql stable security definer
set search_path = public
as $$
  select u.role, u."schoolId"
  from public.users u
  where u.id = (select auth.uid());
$$;

revoke all on function public.portal_user_context() from public;
grant execute on function public.portal_user_context() to authenticated;


-- ----------------------------------------------------------------------------
-- 2) public.users — chairman manages staff of own school; staff read own school
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.users to authenticated;

do $$ begin
  drop policy if exists u_portal_select on public.users;
  drop policy if exists u_portal_insert on public.users;
  drop policy if exists u_portal_update on public.users;
  drop policy if exists u_portal_delete on public.users;
end $$;

-- Any portal user (chairman/staff) may read users of their own school; a user
-- may always read their own row. Student JWTs have no users row → denied.
create policy u_portal_select on public.users
for select to authenticated
using (
  id = (select auth.uid())
  or "schoolId" = (select school_id from public.portal_user_context())
);

-- Only the chairman of that school may create staff rows, and only with
-- role 'staff' (the portal's own chairman rows are managed elsewhere).
create policy u_portal_insert on public.users
for insert to authenticated
with check (
  (select role from public.portal_user_context()) = 'chairman'
  and "schoolId" = (select school_id from public.portal_user_context())
  and role = 'staff'
);

-- Chairman may update any staff row of his school; any user may update own row.
create policy u_portal_update on public.users
for update to authenticated
using (
  id = (select auth.uid())
  or ((select role from public.portal_user_context()) = 'chairman'
      and "schoolId" = (select school_id from public.portal_user_context()))
)
with check (
  id = (select auth.uid())
  or ((select role from public.portal_user_context()) = 'chairman'
      and "schoolId" = (select school_id from public.portal_user_context()))
);

create policy u_portal_delete on public.users
for delete to authenticated
using (
  (select role from public.portal_user_context()) = 'chairman'
  and "schoolId" = (select school_id from public.portal_user_context())
);


-- ----------------------------------------------------------------------------
-- 3) public.attendance — staff (and chairman) may write their school's rows
-- ----------------------------------------------------------------------------
grant select, insert, update on public.attendance to authenticated;

do $$ begin
  drop policy if exists a_staff_insert on public.attendance;
  drop policy if exists a_staff_update on public.attendance;
end $$;

create policy a_staff_insert on public.attendance
for insert to authenticated
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

create policy a_staff_update on public.attendance
for update to authenticated
using (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
)
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);


-- ----------------------------------------------------------------------------
-- 4) public.exam_marks — staff submit (Pending), chairman vets
-- ----------------------------------------------------------------------------
grant select, insert, update on public.exam_marks to authenticated;

do $$ begin
  drop policy if exists em_staff_select on public.exam_marks;
  drop policy if exists em_staff_insert on public.exam_marks;
  drop policy if exists em_staff_update on public.exam_marks;
end $$;

create policy em_staff_select on public.exam_marks
for select to authenticated
using (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

create policy em_staff_insert on public.exam_marks
for insert to authenticated
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

create policy em_staff_update on public.exam_marks
for update to authenticated
using (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);


-- ----------------------------------------------------------------------------
-- 5) homework / notices / leave_requests — staff write paths
-- ----------------------------------------------------------------------------
grant select, insert on public.homework to authenticated;
grant select, insert on public.notices to authenticated;
grant select, insert on public.leave_requests to authenticated;

do $$ begin
  drop policy if exists hw_staff_select on public.homework;
  drop policy if exists hw_staff_insert on public.homework;
  drop policy if exists n_staff_insert on public.notices;
  drop policy if exists lr_staff_insert on public.leave_requests;
  drop policy if exists lr_staff_select on public.leave_requests;
end $$;

create policy hw_staff_select on public.homework
for select to authenticated
using (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

create policy hw_staff_insert on public.homework
for insert to authenticated
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

create policy n_staff_insert on public.notices
for insert to authenticated
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and (select role from public.portal_user_context()) in ('chairman', 'staff')
);

-- Staff leave requests: the row must belong to the caller (staff id), school-scoped.
create policy lr_staff_insert on public.leave_requests
for insert to authenticated
with check (
  "schoolId" = (select school_id from public.portal_user_context())
  and "studentId" = (select auth.uid())
);

create policy lr_staff_select on public.leave_requests
for select to authenticated
using (
  "studentId" = (select auth.uid())
  or ((select role from public.portal_user_context()) = 'chairman'
      and "schoolId" = (select school_id from public.portal_user_context()))
);


-- ----------------------------------------------------------------------------
-- 6) public.attendance_records — FINAL HARDENING (owner-confirmed issue)
--    * Table-level WRITE grants for anon/authenticated are revoked; rows are
--      written only by the existing SECURITY DEFINER sync_attendance_records()
--      (and table owner), never by clients.
--    * ALL existing policies are dropped and replaced by ONE least-privilege
--      SELECT policy: staff/chairman read their school; a student JWT reads
--      only its own rows via current_user_student_id()/current_user_school_id().
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.attendance_records from anon;
revoke insert, update, delete on public.attendance_records from authenticated;
grant select on public.attendance_records to authenticated;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'attendance_records'
  loop
    execute format('drop policy if exists %I on public.attendance_records', r.policyname);
  end loop;
end $$;

create policy ar_portal_select on public.attendance_records
for select to authenticated
using (
  -- staff / chairman (GoTrue session with a users row)
  ( "schoolId" = (select school_id from public.portal_user_context())
    and (select role from public.portal_user_context()) in ('chairman', 'staff') )
  or
  -- student (Render JWT identity helpers; NULL for non-student sessions)
  ( "studentId" = (select public.current_user_student_id())
    and "schoolId" = (select public.current_user_school_id())
    and (select public.current_user_student_id()) is not null )
);


-- ----------------------------------------------------------------------------
-- 7) Performance finding: covering index for the unindexed FK fk_student_school
-- ----------------------------------------------------------------------------
create index if not exists idx_attendance_records_fk_student_school
on public.attendance_records ("studentId", "schoolId");


-- ----------------------------------------------------------------------------
-- 8) INTENTIONALLY NOT TOUCHED (review with owner, do not auto-change)
--    * public.licenses / public.password_requests / public.tickets :
--      RLS enabled with zero policies — confirm intended access model first.
--    * anon-executable SECURITY DEFINER functions is_blacklisted() and
--      submit_admission() : verify input validation inside the functions.
--    * Leaked Password Protection (auth settings) : enable in Dashboard →
--      Auth → Passwords. Not a SQL change.
--    * 5 "unused" indexes and the 33 multiple-permissive-policy findings:
--      workload-dependent; left as-is on purpose.
-- ============================================================================
