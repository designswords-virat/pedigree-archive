-- ============================================================
-- PEDIGREE ARCHIVE — Supabase schema
-- Paste this whole file into the Supabase SQL Editor and run it.
-- It creates the profiles table, row-level-security policies, the
-- auto-create-profile trigger, and the photos storage bucket.
-- Safe to run on a fresh project; uses CREATE IF NOT EXISTS where it can.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. PROFILES TABLE
--   One row per registered user. user_id matches the auth.users id.
--   profile / extended / people are JSONB blobs that mirror what the
--   client used to save into localStorage — minimal schema migration.
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  is_admin   boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  profile    jsonb,                            -- basic info (name, dates, etc.)
  extended   jsonb,                            -- the 6-tab extended details
  people     jsonb default '[]'::jsonb         -- the user's family tree array
);

-- ----------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
--   Default-deny. Then allow:
--     • each user to read/write their own profile row
--     • admins (is_admin = true) to read & delete every row
-- ----------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile"   on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can delete profiles"   on public.profiles;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- Admin check via SECURITY DEFINER helper. Doing the admin lookup inline in
-- the policy would recurse (a policy on profiles that itself selects from
-- profiles → infinite loop → HTTP 500 on every read).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.user_id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant   execute on function public.is_admin() to authenticated;

create policy "Admins can read all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Admins can delete profiles"
  on public.profiles for delete
  using (public.is_admin());

-- ----------------------------------------------------------------
-- 3. AUTO-CREATE PROFILE ROW ON SIGNUP
--   Trigger that fires when Supabase Auth creates a new auth.users
--   row, inserting a matching profiles row so the client always has
--   somewhere to write to.
-- ----------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Lock down the function so it can only be invoked via the trigger above,
-- not via a direct REST RPC call. (Triggers run as definer regardless.)
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- ----------------------------------------------------------------
-- 4. PHOTOS STORAGE BUCKET
--   Public-readable bucket named "photos". Each user can upload to
--   their own folder (path prefix = their user_id) and delete their
--   own files. Anyone can read (public bucket — needed because the
--   tree renderer uses plain URLs in <img> tags).
-- ----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "Public can read photos"     on storage.objects;
drop policy if exists "Users can upload own photos" on storage.objects;
drop policy if exists "Users can delete own photos" on storage.objects;
drop policy if exists "Users can update own photos" on storage.objects;

-- NOTE: no SELECT policy is created. Public buckets serve their files via
-- the public-URL endpoint regardless of RLS. Adding a broad SELECT policy
-- would let anyone list every file in every user's folder, which we don't
-- want. Without it, you can still fetch a known photo URL.

create policy "Users can upload own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own photos"
  on storage.objects for update
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------
-- 5. MAKE YOURSELF ADMIN
--   After you sign up through the app the FIRST time, come back here
--   and run this (replace your email):
--
--     update public.profiles set is_admin = true
--     where email = 'you@example.com';
--
--   Then the "Admin" link on the landing page will show you every
--   user's tree. (Without this you'd just see your own.)
-- ----------------------------------------------------------------
