-- CoreEdu messaging migration: Supabase-native tables, Realtime, and tenant-isolated RLS.
-- Run this file in Supabase SQL Editor after the existing base migration.

begin;

create extension if not exists pgcrypto;

-- Existing installations may already have these tables. The ALTER statements keep
-- the migration safe while normalising the columns used by both portals.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  school_id text references public.schools(id) on delete cascade,
  sender_id text not null,
  sender_name text,
  sender_role text not null,
  receiver_id text,
  receiver_type text not null,
  title text,
  body text not null,
  attachment_url text,
  is_read boolean not null default false,
  replies jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_communications (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.schools(id) on delete cascade,
  sender_id text not null,
  sender_name text,
  sender_role text not null,
  message text not null,
  attachment_url text,
  is_read boolean not null default false,
  reply_to uuid references public.school_communications(id) on delete set null,
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
  status text not null default 'sent',
  created_by_uid text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools add column if not exists logo_url text;
alter table public.direct_messages add column if not exists attachment_url text;
alter table public.school_communications add column if not exists sender_id text;
alter table public.school_communications add column if not exists sender_name text;
alter table public.school_communications add column if not exists sender_role text;
alter table public.school_communications add column if not exists message text;
alter table public.whatsapp_broadcasts add column if not exists group_link text;
alter table public.whatsapp_broadcasts add column if not exists created_by_uid text;

-- Legacy deployments may have created participant IDs as uuid. Firebase UIDs are
-- strings, so normalize those columns before RLS evaluates any participant filter.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'direct_messages' and column_name = 'sender_id' and udt_name = 'uuid') then
    alter table public.direct_messages alter column sender_id type text using sender_id::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'direct_messages' and column_name = 'receiver_id' and udt_name = 'uuid') then
    alter table public.direct_messages alter column receiver_id type text using receiver_id::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'school_communications' and column_name = 'sender_id' and udt_name = 'uuid') then
    alter table public.school_communications alter column sender_id type text using sender_id::text;
  end if;
end $$;

create index if not exists direct_messages_school_created_idx on public.direct_messages (school_id, created_at desc);
create index if not exists direct_messages_participants_idx on public.direct_messages (sender_id, receiver_id, created_at desc);
create index if not exists school_communications_school_created_idx on public.school_communications (school_id, created_at asc);
create index if not exists whatsapp_broadcasts_school_created_idx on public.whatsapp_broadcasts (school_id, created_at desc);

-- Firebase UIDs are arbitrary strings, not PostgreSQL UUIDs. Never call
-- auth.uid() for Firebase third-party tokens because it casts JWT sub to uuid.
create or replace function public.messaging_auth_uid()
returns text language sql stable security definer set search_path = public
as $$ select nullif(auth.jwt() ->> 'sub', ''); $$;

create or replace function public.messaging_school_id()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'school_id', ''),
    (select u.school_id from public.users u where u.auth_uid = public.messaging_auth_uid() limit 1)
  );
$$;

create or replace function public.messaging_role()
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'role', ''),
    (select u.role from public.users u where u.auth_uid = public.messaging_auth_uid() limit 1), ''
  );
$$;

create or replace function public.messaging_is_global_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.messaging_auth_uid() is not null and public.messaging_role() in ('developer','superadmin','admin'); $$;

create or replace function public.messaging_is_school_admin(p_school_id text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.messaging_is_global_admin() or (public.messaging_auth_uid() is not null and public.messaging_school_id() = p_school_id and public.messaging_role() in ('chairman','principal','admin')); $$;

alter table public.direct_messages enable row level security;
alter table public.school_communications enable row level security;
alter table public.whatsapp_broadcasts enable row level security;

-- Remove permissive/legacy policies for these three resources before installing
-- policies that require both tenant membership and participant ownership.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('direct_messages','school_communications','whatsapp_broadcasts') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Direct messages: global admins can manage all; school users can only see rows
-- in their school, and non-admin users can only see their own endpoint rows.
create policy direct_messages_select on public.direct_messages for select using (
  public.messaging_is_global_admin() or (
    school_id = public.messaging_school_id() and
    (sender_id = public.messaging_auth_uid() or receiver_id = public.messaging_auth_uid() or public.messaging_is_school_admin(school_id))
  )
);
create policy direct_messages_insert on public.direct_messages for insert with check (
  public.messaging_is_global_admin() or (
    school_id = public.messaging_school_id() and sender_id = public.messaging_auth_uid()
  )
);
create policy direct_messages_update on public.direct_messages for update using (
  public.messaging_is_global_admin() or (school_id = public.messaging_school_id() and (sender_id = public.messaging_auth_uid() or receiver_id = public.messaging_auth_uid()))
) with check (school_id = public.messaging_school_id() or public.messaging_is_global_admin());
create policy direct_messages_delete on public.direct_messages for delete using (public.messaging_is_global_admin() or (school_id = public.messaging_school_id() and sender_id = public.messaging_auth_uid()));

-- School communication is one private channel per school. Company/global admins
-- can write; school members can write only as themselves and read their tenant.
create policy school_communications_select on public.school_communications for select using (public.messaging_is_global_admin() or school_id = public.messaging_school_id());
create policy school_communications_insert on public.school_communications for insert with check (
  (public.messaging_is_global_admin() or (school_id = public.messaging_school_id() and sender_id = public.messaging_auth_uid()))
);
create policy school_communications_update on public.school_communications for update using (public.messaging_is_global_admin() or school_id = public.messaging_school_id()) with check (public.messaging_is_global_admin() or school_id = public.messaging_school_id());
create policy school_communications_delete on public.school_communications for delete using (public.messaging_is_global_admin() or public.messaging_is_school_admin(school_id));

-- Broadcasts are tenant scoped; global admins may target any school, school
-- admins may only publish inside their own school.
create policy whatsapp_broadcasts_select on public.whatsapp_broadcasts for select using (public.messaging_is_global_admin() or school_id = public.messaging_school_id());
create policy whatsapp_broadcasts_insert on public.whatsapp_broadcasts for insert with check (
  public.messaging_is_global_admin() or (school_id = public.messaging_school_id() and public.messaging_is_school_admin(school_id))
);
create policy whatsapp_broadcasts_update on public.whatsapp_broadcasts for update using (public.messaging_is_global_admin() or public.messaging_is_school_admin(school_id)) with check (public.messaging_is_global_admin() or public.messaging_is_school_admin(school_id));
create policy whatsapp_broadcasts_delete on public.whatsapp_broadcasts for delete using (public.messaging_is_global_admin() or public.messaging_is_school_admin(school_id));

-- Realtime publication (safe if already enabled).
do $$ begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.school_communications;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.whatsapp_broadcasts;
exception when duplicate_object then null;
end $$;

commit;
