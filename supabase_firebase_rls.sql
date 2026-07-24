-- Supabase schema + RLS migration for Firestore replacement/mirroring
-- Covers school/company communications, direct messages, transactions, audit logs,
-- payment ledgers, and supporting utility tables used by the portals.

begin;

create extension if not exists pgcrypto;

-- =====================================================================
-- Utility functions
-- =====================================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.tg_set_inserted_at()
returns trigger
language plpgsql
as $$
begin
  if new.created_at is null then
    new.created_at = now();
  end if;
  return new;
end;
$$;

-- =====================================================================
-- Core identity / org tables
-- =====================================================================
create table if not exists public.schools (
  id text primary key,
  school_name text,
  logo_url text,
  app_fee numeric(12,2),
  billing_date date,
  payment_qr_url text,
  upi_id text,
  payment_alert_sent_at timestamptz,
  payment_blocked boolean default false,
  payment_history jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_uid text unique,
  school_id text references public.schools(id) on delete cascade,
  role text not null,
  full_name text,
  phone text,
  email text,
  plain_password text,
  suggested_password text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text,
  class text,
  roll_no text,
  parentage text,
  father_name text,
  mother_name text,
  mobile text,
  due_balance numeric(12,2) not null default 0,
  fee_due numeric(12,2) not null default 0,
  status text,
  transfer_status text,
  pending_transfer_to text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text,
  designation text,
  mobile text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Communication tables
-- =====================================================================
create table if not exists public.school_communications (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  sender_id text,
  sender_name text,
  sender_role text,
  message text not null,
  attachment_url text,
  is_read boolean not null default false,
  reply_to uuid references public.school_communications(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_communications (
  id uuid primary key default gen_random_uuid(),
  school_id text references public.schools(id) on delete cascade,
  sender_id text,
  sender_name text,
  sender_role text,
  receiver_id text,
  receiver_type text,
  title text,
  body text not null,
  is_read boolean not null default false,
  replies jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  school_id text references public.schools(id) on delete cascade,
  sender_id text,
  sender_name text,
  sender_role text,
  receiver_id text,
  receiver_type text,
  title text,
  body text not null,
  is_read boolean not null default false,
  replies jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_broadcasts (
  id uuid primary key default gen_random_uuid(),
  school_id text references public.schools(id) on delete cascade,
  target_group text,
  group_link text,
  message text not null,
  status text,
  created_by_uid text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Financial tables
-- =====================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  type text not null,
  person_id text,
  person_name text,
  class text,
  mobile text,
  amount numeric(12,2) not null default 0,
  mode text,
  date date,
  ledger_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  payment_type text,
  amount numeric(12,2) not null default 0,
  description text,
  paid_on date,
  reference_no text,
  status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin text,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  school_id text,
  role text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  role text not null,
  scope text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pending_deletions (
  id uuid primary key default gen_random_uuid(),
  target_collection text,
  target_doc_id text,
  ref_collection text,
  ref_id text,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  requested_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recycle_bin (
  id uuid primary key default gen_random_uuid(),
  original_collection text,
  original_id text,
  data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Generic timestamp triggers
-- =====================================================================
drop trigger if exists trg_schools_updated_at on public.schools;
create trigger trg_schools_updated_at
before update on public.schools
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_staff_members_updated_at on public.staff_members;
create trigger trg_staff_members_updated_at
before update on public.staff_members
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_school_communications_updated_at on public.school_communications;
create trigger trg_school_communications_updated_at
before update on public.school_communications
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_company_communications_updated_at on public.company_communications;
create trigger trg_company_communications_updated_at
before update on public.company_communications
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_direct_messages_updated_at on public.direct_messages;
create trigger trg_direct_messages_updated_at
before update on public.direct_messages
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_whatsapp_broadcasts_updated_at on public.whatsapp_broadcasts;
create trigger trg_whatsapp_broadcasts_updated_at
before update on public.whatsapp_broadcasts
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_payment_ledger_updated_at on public.payment_ledger;
create trigger trg_payment_ledger_updated_at
before update on public.payment_ledger
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_audit_logs_updated_at on public.audit_logs;
create trigger trg_audit_logs_updated_at
before update on public.audit_logs
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_login_logs_updated_at on public.login_logs;
create trigger trg_login_logs_updated_at
before update on public.login_logs
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_system_config_updated_at on public.system_config;
create trigger trg_system_config_updated_at
before update on public.system_config
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_global_roles_updated_at on public.global_roles;
create trigger trg_global_roles_updated_at
before update on public.global_roles
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_pending_deletions_updated_at on public.pending_deletions;
create trigger trg_pending_deletions_updated_at
before update on public.pending_deletions
for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_recycle_bin_updated_at on public.recycle_bin;
create trigger trg_recycle_bin_updated_at
before update on public.recycle_bin
for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- RLS helpers
-- =====================================================================
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '') is not null;
$$;

create or replace function public.current_user_school_id()
returns text
language sql
stable
as $$
  select (auth.jwt() ->> 'school_id')::text;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', '');
$$;

create or replace function public.is_school_member(p_school_id text)
returns boolean
language sql
stable
as $$
  select public.is_service_role()
      or (public.is_authenticated() and public.current_user_school_id() = p_school_id);
$$;

create or replace function public.is_school_admin(p_school_id text)
returns boolean
language sql
stable
as $$
  select public.is_service_role()
      or (
        public.is_authenticated()
        and public.current_user_school_id() = p_school_id
        and public.current_user_role() in ('chairman', 'principal', 'admin', 'superadmin')
      );
$$;

create or replace function public.is_global_admin()
returns boolean
language sql
stable
as $$
  select public.is_service_role()
      or public.current_user_role() in ('developer', 'superadmin', 'admin');
$$;

-- =====================================================================
-- Enable RLS
-- =====================================================================
alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.staff_members enable row level security;
alter table public.school_communications enable row level security;
alter table public.company_communications enable row level security;
alter table public.direct_messages enable row level security;
alter table public.whatsapp_broadcasts enable row level security;
alter table public.transactions enable row level security;
alter table public.payment_ledger enable row level security;
alter table public.audit_logs enable row level security;
alter table public.login_logs enable row level security;
alter table public.system_config enable row level security;
alter table public.global_roles enable row level security;
alter table public.pending_deletions enable row level security;
alter table public.recycle_bin enable row level security;

-- =====================================================================
-- Policies: schools
-- =====================================================================
drop policy if exists "schools_select_school_members" on public.schools;
create policy "schools_select_school_members"
on public.schools
for select
using (public.is_school_member(id) or public.is_global_admin());

drop policy if exists "schools_write_global_admin" on public.schools;
create policy "schools_write_global_admin"
on public.schools
for all
using (public.is_global_admin())
with check (public.is_global_admin());

-- =====================================================================
-- Policies: users / students / staff
-- =====================================================================
drop policy if exists "users_select_school_members" on public.users;
create policy "users_select_school_members"
on public.users
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin"
on public.users
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

drop policy if exists "students_select_school_members" on public.students;
create policy "students_select_school_members"
on public.students
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "students_write_admin" on public.students;
create policy "students_write_admin"
on public.students
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

drop policy if exists "staff_select_school_members" on public.staff_members;
create policy "staff_select_school_members"
on public.staff_members
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "staff_write_admin" on public.staff_members;
create policy "staff_write_admin"
on public.staff_members
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

-- =====================================================================
-- Policies: communications
-- =====================================================================
drop policy if exists "school_comm_select_school_members" on public.school_communications;
create policy "school_comm_select_school_members"
on public.school_communications
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "school_comm_write_school_admin" on public.school_communications;
create policy "school_comm_write_school_admin"
on public.school_communications
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

drop policy if exists "company_comm_select_school_members" on public.company_communications;
create policy "company_comm_select_school_members"
on public.company_communications
for select
using (public.is_global_admin() or public.is_school_member(coalesce(school_id, current_user_school_id())));

drop policy if exists "company_comm_write_admin" on public.company_communications;
create policy "company_comm_write_admin"
on public.company_communications
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
on public.direct_messages
for select
using (
  public.is_global_admin()
  or public.is_school_member(coalesce(school_id, current_user_school_id()))
  or sender_id = (auth.jwt() ->> 'sub')
  or receiver_id = (auth.jwt() ->> 'sub')
);

drop policy if exists "direct_messages_write_school_admin" on public.direct_messages;
create policy "direct_messages_write_school_admin"
on public.direct_messages
for all
using (public.is_global_admin() or public.is_school_admin(coalesce(school_id, current_user_school_id())))
with check (public.is_global_admin() or public.is_school_admin(coalesce(school_id, current_user_school_id())));

drop policy if exists "whatsapp_broadcasts_select_school_members" on public.whatsapp_broadcasts;
create policy "whatsapp_broadcasts_select_school_members"
on public.whatsapp_broadcasts
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "whatsapp_broadcasts_write_admin" on public.whatsapp_broadcasts;
create policy "whatsapp_broadcasts_write_admin"
on public.whatsapp_broadcasts
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

-- =====================================================================
-- Policies: finance
-- =====================================================================
drop policy if exists "transactions_select_school_members" on public.transactions;
create policy "transactions_select_school_members"
on public.transactions
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "transactions_write_admin" on public.transactions;
create policy "transactions_write_admin"
on public.transactions
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

drop policy if exists "payment_ledger_select_admin" on public.payment_ledger;
create policy "payment_ledger_select_admin"
on public.payment_ledger
for select
using (public.is_global_admin() or public.is_school_member(school_id));

drop policy if exists "payment_ledger_write_admin" on public.payment_ledger;
create policy "payment_ledger_write_admin"
on public.payment_ledger
for all
using (public.is_global_admin() or public.is_school_admin(school_id))
with check (public.is_global_admin() or public.is_school_admin(school_id));

-- =====================================================================
-- Policies: logs and admin tables
-- =====================================================================
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
on public.audit_logs
for select
using (public.is_global_admin());

drop policy if exists "audit_logs_write_admin" on public.audit_logs;
create policy "audit_logs_write_admin"
on public.audit_logs
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "login_logs_select_admin" on public.login_logs;
create policy "login_logs_select_admin"
on public.login_logs
for select
using (public.is_global_admin());

drop policy if exists "login_logs_write_any" on public.login_logs;
create policy "login_logs_write_any"
on public.login_logs
for insert
with check (true);

drop policy if exists "system_config_select_admin" on public.system_config;
create policy "system_config_select_admin"
on public.system_config
for select
using (public.is_global_admin());

drop policy if exists "system_config_write_admin" on public.system_config;
create policy "system_config_write_admin"
on public.system_config
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "global_roles_select_admin" on public.global_roles;
create policy "global_roles_select_admin"
on public.global_roles
for select
using (public.is_global_admin());

drop policy if exists "global_roles_write_admin" on public.global_roles;
create policy "global_roles_write_admin"
on public.global_roles
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "pending_deletions_select_admin" on public.pending_deletions;
create policy "pending_deletions_select_admin"
on public.pending_deletions
for select
using (public.is_global_admin());

drop policy if exists "pending_deletions_write_admin" on public.pending_deletions;
create policy "pending_deletions_write_admin"
on public.pending_deletions
for all
using (public.is_global_admin())
with check (public.is_global_admin());

drop policy if exists "recycle_bin_select_admin" on public.recycle_bin;
create policy "recycle_bin_select_admin"
on public.recycle_bin
for select
using (public.is_global_admin());

drop policy if exists "recycle_bin_write_admin" on public.recycle_bin;
create policy "recycle_bin_write_admin"
on public.recycle_bin
for all
using (public.is_global_admin())
with check (public.is_global_admin());

commit;
