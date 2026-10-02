-- ============================================================================
-- COREEDU.IN — PHASE A : MULTI-TENANT INSTITUTION + SCHOOL/COLLEGE + DEPARTMENT
-- ----------------------------------------------------------------------------
-- Execution   : MANUAL, by the project owner, in the Supabase SQL Editor.
--               This file was NOT executed by the developer.
-- Idempotency : every statement is re-runnable (IF NOT EXISTS / OR REPLACE /
--               DROP POLICY IF EXISTS + CREATE POLICY).
-- Strategy    : the EXISTING tables are the foundation (rule 28):
--                 public.schools  = institution   (extended, not replaced)
--                 public.users    = staff/auth    (extended via assignments)
--                 public.students = students      (extended, not replaced)
--               New tables only for concepts that do not exist yet:
--                 departments, programs, academic_sessions, academic_levels,
--                 sections, staff_assignments, teaching_assignments.
-- Tenant key  : schools.id  (project convention: "schoolId" text column).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) INSTITUTION EXTENSION (schools = institution)
-- ----------------------------------------------------------------------------
alter table public.schools add column if not exists "institution_type" text not null default 'school';
alter table public.schools add column if not exists "institution_code" text;
alter table public.schools add column if not exists "logoUrl" text;
alter table public.schools add column if not exists "branding" jsonb not null default '{}'::jsonb;
alter table public.schools add column if not exists "academic_config" jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schools_institution_type_check') then
    alter table public.schools add constraint schools_institution_type_check
      check ("institution_type" in ('school', 'college'));
  end if;
end $$;

-- existing rows keep working: everyone so far is a school
update public.schools set "institution_type" = 'school'
 where "institution_type" is null or "institution_type" not in ('school', 'college');


-- ----------------------------------------------------------------------------
-- 2) DEPARTMENTS (college mode)
-- ----------------------------------------------------------------------------
create table if not exists public.departments (
  id           text primary key default gen_random_uuid()::text,
  "schoolId"   text not null references public.schools(id) on delete cascade,
  name         text not null,
  code         text not null,
  status       text not null default 'active',
  metadata     jsonb not null default '{}'::jsonb,
  "createdAt"  timestamptz not null default now()
);
create unique index if not exists departments_school_code_uq
  on public.departments ("schoolId", lower(code));
create index if not exists departments_school_idx on public.departments ("schoolId");


-- ----------------------------------------------------------------------------
-- 3) PROGRAMS / COURSES (BCA, B.Sc Zoology, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.programs (
  id             text primary key default gen_random_uuid()::text,
  "schoolId"     text not null references public.schools(id) on delete cascade,
  "departmentId" text not null references public.departments(id) on delete cascade,
  name           text not null,
  code           text not null,
  "levelType"    text not null default 'semester',   -- semester|year|trimester|custom
  "duration"     integer,
  status         text not null default 'active',
  metadata       jsonb not null default '{}'::jsonb,
  "createdAt"    timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'programs_leveltype_check') then
    alter table public.programs add constraint programs_leveltype_check
      check ("levelType" in ('semester', 'year', 'trimester', 'custom'));
  end if;
end $$;
create unique index if not exists programs_school_code_uq
  on public.programs ("schoolId", lower(code));
create index if not exists programs_dept_idx on public.programs ("departmentId");


-- ----------------------------------------------------------------------------
-- 4) ACADEMIC SESSIONS (2025-26, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.academic_sessions (
  id          text primary key default gen_random_uuid()::text,
  "schoolId"  text not null references public.schools(id) on delete cascade,
  name        text not null,
  "startDate" date,
  "endDate"   date,
  "isCurrent" boolean not null default false,
  status      text not null default 'active',
  "createdAt" timestamptz not null default now()
);
create unique index if not exists academic_sessions_school_name_uq
  on public.academic_sessions ("schoolId", lower(name));


-- ----------------------------------------------------------------------------
-- 5) ACADEMIC LEVELS (Class 10 / Semester 3 / Year 2 / Trimester / custom)
--    For schools these optionally formalise the existing class strings.
-- ----------------------------------------------------------------------------
create table if not exists public.academic_levels (
  id             text primary key default gen_random_uuid()::text,
  "schoolId"     text not null references public.schools(id) on delete cascade,
  "departmentId" text references public.departments(id) on delete cascade,
  "programId"    text references public.programs(id) on delete cascade,
  name           text not null,
  code           text not null,
  kind           text not null default 'class',     -- class|semester|year|trimester|custom
  "sortOrder"    integer not null default 0,
  "createdAt"    timestamptz not null default now()
);
create unique index if not exists academic_levels_school_code_uq
  on public.academic_levels ("schoolId", lower(code));


-- ----------------------------------------------------------------------------
-- 6) SECTIONS (Class 10-A, BCA Sem 3-A)
-- ----------------------------------------------------------------------------
create table if not exists public.sections (
  id                 text primary key default gen_random_uuid()::text,
  "schoolId"         text not null references public.schools(id) on delete cascade,
  "levelId"          text references public.academic_levels(id) on delete cascade,
  "programId"        text references public.programs(id) on delete cascade,
  class              text,                          -- school mode compatibility
  name               text not null,                 -- 'A', 'B', ...
  "academicSessionId" text references public.academic_sessions(id) on delete set null,
  "createdAt"        timestamptz not null default now()
);
create unique index if not exists sections_scope_uq
  on public.sections ("schoolId", coalesce(class, ''), coalesce("programId", ''), coalesce("levelId", ''), name);


-- ----------------------------------------------------------------------------
-- 7) STAFF ASSIGNMENTS  (one user may serve several departments/programs)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_assignments (
  id             text primary key default gen_random_uuid()::text,
  "schoolId"     text not null references public.schools(id) on delete cascade,
  "userId"       text not null references public.users(id) on delete cascade,
  "departmentId" text references public.departments(id) on delete cascade,
  "programId"    text references public.programs(id) on delete cascade,
  "roleId"       text not null default 'teacher',   -- hod|teacher|staff
  "isPrimary"    boolean not null default true,
  metadata       jsonb not null default '{}'::jsonb,
  "createdAt"    timestamptz not null default now()
);
create unique index if not exists staff_assignments_scope_uq
  on public.staff_assignments ("userId", coalesce("departmentId", ''), coalesce("programId", ''));
create index if not exists staff_assignments_user_idx on public.staff_assignments ("userId");
create index if not exists staff_assignments_dept_idx on public.staff_assignments ("departmentId");


-- ----------------------------------------------------------------------------
-- 8) TEACHING ASSIGNMENTS (staff <-> subject/class/section)
-- ----------------------------------------------------------------------------
create table if not exists public.teaching_assignments (
  id                  text primary key default gen_random_uuid()::text,
  "schoolId"          text not null references public.schools(id) on delete cascade,
  "userId"            text not null references public.users(id) on delete cascade,
  "departmentId"      text references public.departments(id) on delete cascade,
  "programId"         text references public.programs(id) on delete cascade,
  "levelId"           text references public.academic_levels(id) on delete cascade,
  class               text,
  "sectionId"         text references public.sections(id) on delete cascade,
  subject             text not null,
  "academicSessionId" text references public.academic_sessions(id) on delete set null,
  "createdAt"         timestamptz not null default now()
);
create index if not exists teaching_assignments_user_idx on public.teaching_assignments ("userId");
create index if not exists teaching_assignments_dept_idx on public.teaching_assignments ("departmentId");


-- ----------------------------------------------------------------------------
-- 9) STUDENT ACADEMIC STRUCTURE (permanent id stays students.id)
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists "departmentId"      text;
alter table public.students add column if not exists "programId"         text;
alter table public.students add column if not exists "academicSessionId" text;
alter table public.students add column if not exists "levelId"           text;
alter table public.students add column if not exists "sectionId"         text;
alter table public.students add column if not exists "rollCode"          text;

-- Roll numbers are human-readable but NOT primary keys; uniqueness lives in
-- the academic scope, never globally.
create unique index if not exists students_rollcode_scope_uq
  on public.students ("schoolId",
                      coalesce("academicSessionId", ''),
                      coalesce("programId", ''),
                      coalesce(class, ''),
                      coalesce("sectionId", ''),
                      "rollCode")
  where "rollCode" is not null;
create index if not exists students_dept_idx on public.students ("departmentId");
create index if not exists students_program_idx on public.students ("programId");



-- ----------------------------------------------------------------------------
-- 10) SECURITY-DEFINER CONTEXT HELPERS (no RLS recursion: owner bypass)
-- ----------------------------------------------------------------------------
create or replace function public.pa_user_context()
returns table (user_id text, role text, staff_role text, school_id text)
language sql stable security definer set search_path = public as $$
  select u.id, u.role, u."staffRole", u."schoolId"
  from public.users u
  where u.id = (select auth.uid())::text;
$$;

create or replace function public.pa_user_department_ids(p_user_id text)
returns setof text
language sql stable security definer set search_path = public as $$
  select distinct sa."departmentId"
  from public.staff_assignments sa
  where sa."userId" = p_user_id and sa."departmentId" is not null;
$$;

create or replace function public.pa_caller_department_ids()
returns setof text
language sql stable security definer set search_path = public as $$
  select public.pa_user_department_ids((select auth.uid())::text);
$$;

-- scalable human-readable roll codes, e.g. BCA-SEM3-A-027 / CLASS-10-A-027
create or replace function public.next_roll_code(
  p_school_id text, p_session_id text, p_program_id text,
  p_class text, p_section_id text)
returns text
language plpgsql stable security definer set search_path = public as $$
declare n integer;
begin
  select count(*) + 1 into n
  from public.students s
  where s."schoolId" = p_school_id
    and coalesce(s."academicSessionId", '') = coalesce(p_session_id, '')
    and coalesce(s."programId", '')         = coalesce(p_program_id, '')
    and coalesce(s.class, '')               = coalesce(p_class, '')
    and coalesce(s."sectionId", '')         = coalesce(p_section_id, '');
  return lpad(n::text, 3, '0');
end;
$$;

grant execute on function public.pa_user_context() to authenticated;
grant execute on function public.pa_user_department_ids(text) to authenticated;
grant execute on function public.pa_caller_department_ids() to authenticated;
grant execute on function public.next_roll_code(text, text, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 11) RLS ON NEW TABLES — tenant + department isolation at the database
-- ----------------------------------------------------------------------------
alter table public.departments          enable row level security;
alter table public.programs             enable row level security;
alter table public.academic_sessions    enable row level security;
alter table public.academic_levels      enable row level security;
alter table public.sections             enable row level security;
alter table public.staff_assignments    enable row level security;
alter table public.teaching_assignments enable row level security;

-- readers: chairman of the tenant, institution management staff, or staff
-- holding an assignment inside the tenant.
drop policy if exists pa_departments_select on public.departments;
create policy pa_departments_select on public.departments for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or (select staff_role from public.pa_user_context()) in ('Chairman','Principal','Vice Principal','HOD')
         or exists (select 1 from public.staff_assignments sa
                    where sa."userId" = (select auth.uid())::text
                      and sa."schoolId" = "schoolId")
       ));

drop policy if exists pa_departments_write on public.departments;
create policy pa_departments_write on public.departments for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman')
with check ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman');

-- programs / levels / sections: same shape
drop policy if exists pa_programs_select on public.programs;
create policy pa_programs_select on public.programs for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or (select staff_role from public.pa_user_context()) in ('Chairman','Principal','Vice Principal','HOD')
         or exists (select 1 from public.staff_assignments sa
                    where sa."userId" = (select auth.uid())::text and sa."schoolId" = "schoolId")
       ));
drop policy if exists pa_programs_write on public.programs;
create policy pa_programs_write on public.programs for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and ((select role from public.pa_user_context()) = 'chairman'
            or ((select staff_role from public.pa_user_context()) = 'HOD'
                and "departmentId" in (select public.pa_caller_department_ids()))))
with check ("schoolId" = (select school_id from public.pa_user_context())
       and ((select role from public.pa_user_context()) = 'chairman'
            or ((select staff_role from public.pa_user_context()) = 'HOD'
                and "departmentId" in (select public.pa_caller_department_ids()))));

drop policy if exists pa_sessions_select on public.academic_sessions;
create policy pa_sessions_select on public.academic_sessions for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context()));
drop policy if exists pa_sessions_write on public.academic_sessions;
create policy pa_sessions_write on public.academic_sessions for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman')
with check ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman');

drop policy if exists pa_levels_select on public.academic_levels;
create policy pa_levels_select on public.academic_levels for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or (select staff_role from public.pa_user_context()) in ('Chairman','Principal','Vice Principal','HOD')
         or exists (select 1 from public.staff_assignments sa
                    where sa."userId" = (select auth.uid())::text and sa."schoolId" = "schoolId")
       ));
drop policy if exists pa_levels_write on public.academic_levels;
create policy pa_levels_write on public.academic_levels for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and ((select role from public.pa_user_context()) = 'chairman'
            or ((select staff_role from public.pa_user_context()) = 'HOD'
                and "departmentId" in (select public.pa_caller_department_ids()))))
with check ("schoolId" = (select school_id from public.pa_user_context())
       and ((select role from public.pa_user_context()) = 'chairman'
            or ((select staff_role from public.pa_user_context()) = 'HOD'
                and "departmentId" in (select public.pa_caller_department_ids()))));

drop policy if exists pa_sections_select on public.sections;
create policy pa_sections_select on public.sections for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context()));
drop policy if exists pa_sections_write on public.sections;
create policy pa_sections_write on public.sections for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman')
with check ("schoolId" = (select school_id from public.pa_user_context())
       and (select role from public.pa_user_context()) = 'chairman');

-- staff_assignments: self-read, chairman full, HOD own departments (and HOD
-- may only assign teacher/staff roles, never chairman/hod roles)
drop policy if exists pa_staff_assign_select on public.staff_assignments;
create policy pa_staff_assign_select on public.staff_assignments for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         "userId" = (select auth.uid())::text
         or (select role from public.pa_user_context()) = 'chairman'
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids()))
       ));
drop policy if exists pa_staff_assign_write on public.staff_assignments;
create policy pa_staff_assign_write on public.staff_assignments for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids()))
       ))
with check ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids())
             and "roleId" in ('teacher', 'staff'))
       ));

-- teaching_assignments: same shape
drop policy if exists pa_teaching_select on public.teaching_assignments;
create policy pa_teaching_select on public.teaching_assignments for select to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         "userId" = (select auth.uid())::text
         or (select role from public.pa_user_context()) = 'chairman'
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids()))
       ));
drop policy if exists pa_teaching_write on public.teaching_assignments;
create policy pa_teaching_write on public.teaching_assignments for all to authenticated
using ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or "userId" = (select auth.uid())::text
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids()))
       ))
with check ("schoolId" = (select school_id from public.pa_user_context())
       and (
         (select role from public.pa_user_context()) = 'chairman'
         or ((select staff_role from public.pa_user_context()) = 'HOD'
             and "departmentId" in (select public.pa_caller_department_ids()))
       ));


-- ----------------------------------------------------------------------------
-- 12) DEPARTMENT ISOLATION ON EXISTING SENSITIVE TABLES
--     Restrictive policies NARROW every existing permissive policy, so a
--     college teacher/HOD can never read another department's rows even by
--     hand-crafted requests. School mode and management roles pass through.
-- ----------------------------------------------------------------------------
drop policy if exists pa_students_dept_restrict on public.students;
create policy pa_students_dept_restrict on public.students
as restrictive for select to authenticated
using (
  (select s."institution_type" from public.schools s
     where s.id = (select school_id from public.pa_user_context())) is distinct from 'college'
  or (select role from public.pa_user_context()) = 'chairman'
  or (select staff_role from public.pa_user_context()) in ('Chairman', 'Principal', 'Vice Principal')
  or "departmentId" is null
  or "departmentId" in (select public.pa_caller_department_ids())
);

drop policy if exists pa_users_dept_restrict on public.users;
create policy pa_users_dept_restrict on public.users
as restrictive for select to authenticated
using (
  (select s."institution_type" from public.schools s
     where s.id = (select school_id from public.pa_user_context())) is distinct from 'college'
  or (select role from public.pa_user_context()) = 'chairman'
  or (select staff_role from public.pa_user_context()) in ('Chairman', 'Principal', 'Vice Principal')
  or id = (select auth.uid())::text
  or id in (select sa."userId" from public.staff_assignments sa
            where sa."departmentId" in (select public.pa_caller_department_ids()))
);


-- ----------------------------------------------------------------------------
-- 13) PUBLIC SURFACES (admission portal) — no private data, anon readable
-- ----------------------------------------------------------------------------
create or replace view public.vw_public_institution as
  select id, "schoolName", "logoUrl", "themeColor", "admissionOpen",
         "institution_type", "academic_config"
  from public.schools;

create or replace view public.vw_public_departments as
  select d.id, d."schoolId", d.name, d.code
  from public.departments d
  join public.schools s on s.id = d."schoolId"
  where d.status = 'active' and s."admissionOpen" = true;

create or replace view public.vw_public_programs as
  select p.id, p."schoolId", p."departmentId", p.name, p.code, p."levelType"
  from public.programs p
  join public.schools s on s.id = p."schoolId"
  where p.status = 'active' and s."admissionOpen" = true;

create or replace view public.vw_public_levels as
  select l.id, l."schoolId", l."programId", l.name, l.code, l.kind, l."sortOrder"
  from public.academic_levels l
  join public.schools s on s.id = l."schoolId"
  where s."admissionOpen" = true;

grant select on public.vw_public_institution to anon, authenticated;
grant select on public.vw_public_departments to anon, authenticated;
grant select on public.vw_public_programs   to anon, authenticated;
grant select on public.vw_public_levels     to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 14) COLLEGE ADMISSION RPC (anon-callable, SECURITY DEFINER, mirrors the
--     safety contract of submit_admission: closed check + tenant insert)
-- ----------------------------------------------------------------------------
create or replace function public.submit_admission_v2(p_school_id text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sch public.schools%rowtype;
  new_id text;
begin
  select * into sch from public.schools where id = p_school_id;
  if sch is null then
    raise exception 'unknown institution';
  end if;
  if sch."admissionOpen" is not true then
    raise exception 'admissions closed';
  end if;
  -- mirrors the existing submit_admission contract: the whole payload lives
  -- in the jsonb `data` column (college keys departmentId/programId ride
  -- inside it and surface when the institution approves/places the student).
  insert into public.admission_applications ("schoolId", data, status)
  values (p_school_id, p_payload, 'Pending')
  returning id into new_id;
  if new_id is null then raise exception 'insert failed'; end if;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

grant execute on function public.submit_admission_v2(text, jsonb) to anon, authenticated;

-- PostgREST schema cache refresh
select pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- END OF PHASE A MIGRATION
-- ============================================================================
