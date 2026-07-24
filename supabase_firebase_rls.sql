-- Supabase RLS policies for Firebase-authenticated users.
-- Run this in the Supabase SQL Editor after creating the referenced tables/columns.
-- Expected Firebase JWT claims:
--   auth.jwt()->>'sub' = Firebase UID
--   auth.jwt()->>'role' = optional app role
--   auth.jwt()->>'school_id' = optional custom claim for school scoping

create schema if not exists app_private;

create or replace function public.firebase_uid()
returns text
language sql
stable
as $$
    select nullif(auth.jwt()->>'sub', '')
$$;

create or replace function public.firebase_role()
returns text
language sql
stable
as $$
    select coalesce(
        nullif(auth.jwt()->>'role', ''),
        nullif(auth.jwt()->'app_metadata'->>'role', ''),
        nullif(auth.jwt()->'user_metadata'->>'role', '')
    )
$$;

create or replace function public.firebase_school_id()
returns text
language sql
stable
as $$
    select coalesce(
        nullif(auth.jwt()->>'school_id', ''),
        nullif(auth.jwt()->'app_metadata'->>'school_id', ''),
        nullif(auth.jwt()->'user_metadata'->>'school_id', '')
    )
$$;

create or replace function public.is_school_admin()
returns boolean
language sql
stable
as $$
    select public.firebase_role() in ('chairman', 'admin', 'super_admin')
$$;

-- Optional user profile table. Keep it synced with Firebase users/firestore if you need role checks from DB.
create table if not exists public.user_profiles (
    firebase_uid text primary key,
    school_id text not null,
    role text not null check (role in ('super_admin', 'chairman', 'admin', 'staff', 'student')),
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles
for select
to authenticated
using (firebase_uid = public.firebase_uid());

drop policy if exists "admins can read school profiles" on public.user_profiles;
create policy "admins can read school profiles"
on public.user_profiles
for select
to authenticated
using (
    public.is_school_admin()
    and school_id = public.firebase_school_id()
);

-- Example protected table. Rename or duplicate these policies for real tables like students, staff, fees, attendance, notices.
create table if not exists public.school_records (
    id uuid primary key default gen_random_uuid(),
    school_id text not null,
    owner_uid text,
    record_type text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.school_records enable row level security;

drop policy if exists "school members can read school records" on public.school_records;
create policy "school members can read school records"
on public.school_records
for select
to authenticated
using (
    school_id = public.firebase_school_id()
    or owner_uid = public.firebase_uid()
);

drop policy if exists "admins can insert school records" on public.school_records;
create policy "admins can insert school records"
on public.school_records
for insert
to authenticated
with check (
    public.is_school_admin()
    and school_id = public.firebase_school_id()
);

drop policy if exists "admins can update school records" on public.school_records;
create policy "admins can update school records"
on public.school_records
for update
to authenticated
using (
    public.is_school_admin()
    and school_id = public.firebase_school_id()
)
with check (
    public.is_school_admin()
    and school_id = public.firebase_school_id()
);

drop policy if exists "admins can delete school records" on public.school_records;
create policy "admins can delete school records"
on public.school_records
for delete
to authenticated
using (
    public.is_school_admin()
    and school_id = public.firebase_school_id()
);

-- If Firebase custom claims are not available, use this DB-backed helper instead of firebase_school_id/firebase_role.
create or replace function public.current_user_profile()
returns public.user_profiles
language sql
stable
security definer
set search_path = public
as $$
    select p
    from public.user_profiles p
    where p.firebase_uid = public.firebase_uid()
      and p.status = 'active'
    limit 1
$$;
